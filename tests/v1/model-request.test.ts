import { createV1ChatParamsHook } from "../../src/adapters/v1/chat-params.js";
import { createV1ModelRequestGateHandler } from "../../src/adapters/v1/capabilities/model-request-gate.js";
import { createV1SessionAgentModelObservationHandler } from "../../src/adapters/v1/capabilities/session-agent-model-observation.js";
import type { ModelRequestIdentity } from "../../src/contract/model-request.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const nativeInput = {
  sessionID: "session-1",
  agent: "worker",
  model: {
    id: "claude-sonnet-4-5",
    providerID: "anthropic",
  },
};

async function assertStableIdentityMapping(): Promise<void> {
  let observed: ModelRequestIdentity | undefined;
  const hook = createV1ChatParamsHook([
    createV1SessionAgentModelObservationHandler((identity) => {
      observed = identity;
    }),
  ]);
  const output = {
    temperature: 0.2,
    options: { reasoning: true },
  };

  await hook(nativeInput, output);

  assert(observed !== undefined, "v1 chat.params must deliver model identity");
  assert(observed.sessionID === "session-1", "session id must be preserved");
  assert(observed.agent === "worker", "agent id must be preserved");
  assert(observed.providerID === "anthropic", "provider id must be preserved");
  assert(
    observed.modelID === "claude-sonnet-4-5",
    "model id must be preserved",
  );
  assert(
    output.temperature === 0.2 && output.options.reasoning === true,
    "identity capabilities must not mutate native LLM params",
  );
}

async function assertGateIsAwaited(): Promise<void> {
  let release: (() => void) | undefined;
  let entered = false;
  let completed = false;
  const hook = createV1ChatParamsHook([
    createV1ModelRequestGateHandler(() => {
      entered = true;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    }),
  ]);

  const pending = hook(nativeInput, {}).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(entered, "v1 model-request gate must be invoked");
  assert(!completed, "v1 chat.params must await the model-request gate");
  assert(release !== undefined, "gate promise must have started");

  release();
  await pending;
  assert(completed, "v1 chat.params must continue after the gate resolves");
}

async function assertGateFailureBlocksHook(): Promise<void> {
  const failure = new Error("request denied");
  const hook = createV1ChatParamsHook([
    createV1ModelRequestGateHandler(() => {
      throw failure;
    }),
  ]);

  let caught: unknown;
  try {
    await hook(nativeInput, {});
  } catch (error) {
    caught = error;
  }

  assert(caught === failure, "v1 gate failure must remain observable to the host");
}

async function assertCapabilitiesRemainIndependent(): Promise<void> {
  let gateCount = 0;
  let observationCount = 0;
  const getGateCount = () => gateCount;
  const getObservationCount = () => observationCount;

  const gateOnly = createV1ChatParamsHook([
    createV1ModelRequestGateHandler(() => {
      gateCount += 1;
    }),
  ]);
  await gateOnly(nativeInput, {});
  assert(getGateCount() === 1, "gate capability must work without observation");
  assert(
    getObservationCount() === 0,
    "gate capability must not acquire observation semantics",
  );

  const observationOnly = createV1ChatParamsHook([
    createV1SessionAgentModelObservationHandler(() => {
      observationCount += 1;
    }),
  ]);
  await observationOnly(nativeInput, {});
  assert(
    getObservationCount() === 1,
    "observation capability must work without a model-request gate",
  );
  assert(getGateCount() === 1, "observation must not acquire gate semantics");
}

void (async () => {
  await assertStableIdentityMapping();
  await assertGateIsAwaited();
  await assertGateFailureBlocksHook();
  await assertCapabilitiesRemainIndependent();
})();
