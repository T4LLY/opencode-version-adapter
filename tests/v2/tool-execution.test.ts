import {
  createV2SuccessfulToolCompletionCapability,
  createV2ToolBeforeExecutionCapability,
  type V2ToolHooks,
  type V2ToolHookDomain,
  type V2ToolHookRegistration,
} from "../../src/adapters/v2/index.js";
import {
  ADAPTER_ERROR_CATEGORY,
  InvalidHostContextError,
} from "../../src/contract/errors.js";
import type {
  SuccessfulToolCompletionInput,
  ToolBeforeExecutionInput,
} from "../../src/contract/tool-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeToolHooks implements V2ToolHookDomain {
  readonly callbacks: {
    [Name in keyof V2ToolHooks]?: (event: V2ToolHooks[Name]) => void | Promise<void>;
  } = {};
  readonly disposed: string[] = [];

  async hook<Name extends keyof V2ToolHooks>(
    name: Name,
    callback: (event: V2ToolHooks[Name]) => void | Promise<void>,
  ): Promise<V2ToolHookRegistration> {
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

  async emit<Name extends keyof V2ToolHooks>(
    name: Name,
    event: V2ToolHooks[Name],
  ): Promise<void> {
    const callback = this.callbacks[name] as
      | ((value: V2ToolHooks[Name]) => void | Promise<void>)
      | undefined;
    if (callback === undefined) throw new Error(`missing callback:${name}`);
    await callback(event);
  }
}

const beforeEvent = {
  tool: "bash",
  sessionID: "session-v2",
  agent: "worker",
  messageID: "message-v2",
  id: "call-v2",
  input: { command: "echo hello" },
} as const;

const completedEvent = {
  ...beforeEvent,
  status: "completed" as const,
  result: { title: "done", output: "hello" },
};

const errorEvent = {
  ...beforeEvent,
  status: "error" as const,
  error: new Error("tool failed"),
};

async function assertBeforeMappingIsMinimalAndAwaited(): Promise<void> {
  const tool = new FakeToolHooks();
  let received: ToolBeforeExecutionInput | undefined;
  let release: (() => void) | undefined;
  let completed = false;

  const cleanup = await createV2ToolBeforeExecutionCapability((input) => {
    received = input;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  }).install({ tool });

  const pending = tool.emit("execute.before", beforeEvent).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(received !== undefined, "v2 execute.before must invoke the shared callback");
  assert(received.sessionID === "session-v2", "before mapping must preserve session id");
  assert(
    Object.keys(received).join("|") === "sessionID",
    "before mapping must not promote v2-only tool, agent, message, call, or input fields",
  );
  assert(release !== undefined, "before callback promise must start at the native hook");
  assert(!completed, "v2 execute.before must await the shared release point");

  release();
  await pending;
  assert(completed, "tool execution may continue after the shared callback resolves");

  await cleanup?.();
  assert(
    tool.disposed.join("|") === "execute.before",
    "before-tool capability must own its native hook registration",
  );
}

async function assertBeforeFailurePropagates(): Promise<void> {
  const tool = new FakeToolHooks();
  const failure = new Error("release denied");

  await createV2ToolBeforeExecutionCapability(() => {
    throw failure;
  }).install({ tool });

  let caught: unknown;
  try {
    await tool.emit("execute.before", beforeEvent);
  } catch (error) {
    caught = error;
  }

  assert(caught === failure, "v2 before-tool failure must remain observable to the host");
}

async function assertSuccessfulCompletionFiltersNativeErrors(): Promise<void> {
  const tool = new FakeToolHooks();
  const received: SuccessfulToolCompletionInput[] = [];

  const cleanup = await createV2SuccessfulToolCompletionCapability((input) => {
    received.push(input);
  }).install({ tool });

  await tool.emit("execute.after", errorEvent);
  assert(received.length === 0, "v2 native error branch must not become shared success");

  await tool.emit("execute.after", completedEvent);
  assert(
    Array.from(received).length === 1,
    "v2 completed branch must emit one shared completion",
  );
  const completion = received[0];
  assert(completion !== undefined, "completed branch must produce a completion payload");
  assert(completion.sessionID === "session-v2", "completion must preserve session id");
  assert(completion.tool === "bash", "completion must preserve tool id");
  assert(completion.args === completedEvent.input, "completion args must preserve native input identity");
  assert(
    Object.keys(completion).join("|") === "sessionID|tool|args",
    "completion must not promote v2-only agent, message, call, result, or error fields",
  );

  await cleanup?.();
  assert(
    tool.disposed.join("|") === "execute.after",
    "completion capability must own its native hook registration",
  );
}

async function assertCompletionCallbackIsAwaited(): Promise<void> {
  const tool = new FakeToolHooks();
  let release: (() => void) | undefined;
  let completed = false;

  await createV2SuccessfulToolCompletionCapability(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  ).install({ tool });

  const pending = tool.emit("execute.after", completedEvent).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(release !== undefined, "completion callback promise must start at execute.after");
  assert(!completed, "native execute.after must await shared completion delivery");
  release();
  await pending;
  assert(completed, "native execute.after continues after completion delivery resolves");
}

async function assertMissingToolDomainFailsClosed(): Promise<void> {
  for (const capability of [
    createV2ToolBeforeExecutionCapability(() => {}),
    createV2SuccessfulToolCompletionCapability(() => {}),
  ]) {
    let error: unknown;
    try {
      await capability.install({});
    } catch (caught) {
      error = caught;
    }

    assert(
      error instanceof InvalidHostContextError,
      "missing v2 tool hook domain must use invalid-host-context",
    );
    assert(
      error.category === ADAPTER_ERROR_CATEGORY.invalidHostContext,
      "missing v2 tool hook domain must retain the stable error category",
    );
  }
}

void (async () => {
  await assertBeforeMappingIsMinimalAndAwaited();
  await assertBeforeFailurePropagates();
  await assertSuccessfulCompletionFiltersNativeErrors();
  await assertCompletionCallbackIsAwaited();
  await assertMissingToolDomainFailsClosed();
})();
