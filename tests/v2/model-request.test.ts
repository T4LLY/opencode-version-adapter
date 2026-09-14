import {
  createV2ModelRequestGateCapability,
  createV2SessionAgentModelObservationCapability,
  type V2SessionHooks,
  type V2SessionHookDomain,
  type V2SessionHookRegistration,
} from "../../src/adapters/v2";
import {
  ADAPTER_ERROR_CATEGORY,
  InvalidHostContextError,
} from "../../src/contract/errors";
import type { ModelRequestIdentity } from "../../src/contract/model-request";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const nativeIdentity = {
  sessionID: "session-v2",
  agent: "worker",
  model: {
    providerID: "anthropic",
    id: "claude-sonnet-4-5",
  },
};

class FakeSessionHooks implements V2SessionHookDomain {
  readonly callbacks: {
    [Name in keyof V2SessionHooks]?: (event: V2SessionHooks[Name]) => void | Promise<void>;
  } = {};
  readonly disposed: string[] = [];

  async hook<Name extends keyof V2SessionHooks>(
    name: Name,
    callback: (event: V2SessionHooks[Name]) => void | Promise<void>,
  ): Promise<V2SessionHookRegistration> {
    this.callbacks[name] = callback as never;
    let done = false;
    return {
      dispose: async () => {
        if (done) return;
        done = true;
        this.disposed.push(name);
      },
    };
  }

  async emit<Name extends keyof V2SessionHooks>(
    name: Name,
    event: V2SessionHooks[Name],
  ): Promise<void> {
    const callback = this.callbacks[name] as
      | ((value: V2SessionHooks[Name]) => void | Promise<void>)
      | undefined;
    if (callback === undefined) throw new Error(`missing callback:${name}`);
    await callback(event);
  }
}

async function assertStableIdentityMappingAndIndependentHooks(): Promise<void> {
  const session = new FakeSessionHooks();
  let gated: ModelRequestIdentity | undefined;
  let observed: ModelRequestIdentity | undefined;
  const getObserved = () => observed;

  const gateCleanup = await createV2ModelRequestGateCapability((identity) => {
    gated = identity;
  }).install({ session });
  const observationCleanup = await createV2SessionAgentModelObservationCapability(
    (identity) => {
      observed = identity;
    },
  ).install({ session });

  assert(
    session.callbacks["model.request"] !== undefined,
    "v2 gate must register model.request",
  );
  assert(
    session.callbacks.context !== undefined,
    "v2 observation must register context",
  );

  await session.emit("model.request", nativeIdentity);
  assert(gated !== undefined, "v2 model.request must invoke the blocking gate");
  assert(getObserved() === undefined, "gate hook must not acquire observation semantics");
  assert(gated.sessionID === "session-v2", "session id must be preserved");
  assert(gated.agent === "worker", "agent id must be preserved");
  assert(gated.providerID === "anthropic", "provider id must be preserved");
  assert(gated.modelID === "claude-sonnet-4-5", "model id must be preserved");

  await session.emit("context", nativeIdentity);
  const nextObserved = getObserved();
  assert(nextObserved !== undefined, "v2 context must invoke passive observation");
  assert(nextObserved.sessionID === "session-v2", "observed session id must be preserved");
  assert(nextObserved.agent === "worker", "observed agent id must be preserved");
  assert(nextObserved.providerID === "anthropic", "observed provider id must be preserved");
  assert(nextObserved.modelID === "claude-sonnet-4-5", "observed model id must be preserved");

  await observationCleanup?.();
  await gateCleanup?.();
  assert(
    session.disposed.join("|") === "context|model.request",
    "each v2 session hook registration must be owned by its capability cleanup",
  );
}

async function assertGateIsAwaitedAndFailurePropagates(): Promise<void> {
  const session = new FakeSessionHooks();
  let release: (() => void) | undefined;
  let completed = false;

  const cleanup = await createV2ModelRequestGateCapability(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  ).install({ session });

  const pending = session.emit("model.request", nativeIdentity).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(release !== undefined, "v2 gate promise must start at model.request");
  assert(!completed, "v2 model.request hook must await the blocking gate");
  release();
  await pending;
  assert(completed, "v2 model request must continue after the gate resolves");
  await cleanup?.();

  const failingSession = new FakeSessionHooks();
  const failure = new Error("request denied");
  await createV2ModelRequestGateCapability(() => {
    throw failure;
  }).install({ session: failingSession });

  let caught: unknown;
  try {
    await failingSession.emit("model.request", nativeIdentity);
  } catch (error) {
    caught = error;
  }
  assert(caught === failure, "v2 gate failure must remain observable to the host");
}

async function assertMissingSessionHookFailsClosed(): Promise<void> {
  for (const capability of [
    createV2ModelRequestGateCapability(() => {}),
    createV2SessionAgentModelObservationCapability(() => {}),
  ]) {
    let error: unknown;
    try {
      await capability.install({});
    } catch (caught) {
      error = caught;
    }

    assert(
      error instanceof InvalidHostContextError,
      "missing v2 session hook domain must use invalid-host-context",
    );
    assert(
      error.category === ADAPTER_ERROR_CATEGORY.invalidHostContext,
      "missing v2 session hook domain must retain the stable error category",
    );
  }
}

void (async () => {
  await assertStableIdentityMappingAndIndependentHooks();
  await assertGateIsAwaitedAndFailurePropagates();
  await assertMissingSessionHookFailsClosed();
})();
