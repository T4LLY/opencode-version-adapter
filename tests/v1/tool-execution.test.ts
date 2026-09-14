import { createV1SuccessfulToolCompletionHook } from "../../src/adapters/v1/capabilities/successful-tool-completion";
import { createV1ToolBeforeExecutionHook } from "../../src/adapters/v1/capabilities/tool-before-execution";
import type {
  SuccessfulToolCompletionInput,
  ToolBeforeExecutionInput,
} from "../../src/contract/tool-execution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertBeforeToolIsAwaited(): Promise<void> {
  let observed: ToolBeforeExecutionInput | undefined;
  let release: (() => void) | undefined;
  let completed = false;
  const hook = createV1ToolBeforeExecutionHook((input) => {
    observed = input;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const output = { args: { command: "echo original" } };

  const pending = hook(
    { tool: "bash", sessionID: "session-1", callID: "call-1" },
    output,
  ).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(observed !== undefined, "v1 before-tool callback must be invoked");
  assert(
    observed.sessionID === "session-1",
    "v1 before-tool mapping must preserve session identity",
  );
  assert(
    Object.keys(observed).length === 1,
    "shared before-tool contract must not expose unused native fields",
  );
  assert(!completed, "v1 before-tool hook must await the shared callback");
  assert(release !== undefined, "before-tool callback must have started");
  assert(
    output.args !== undefined,
    "before-tool mapping must not mutate native args as a side effect",
  );

  release();
  await pending;
  assert(completed, "tool execution may continue after the callback resolves");
}

async function assertBeforeToolFailureBlocksHostHook(): Promise<void> {
  const failure = new Error("release failed");
  const hook = createV1ToolBeforeExecutionHook(() => {
    throw failure;
  });

  let caught: unknown;
  try {
    await hook(
      { tool: "task", sessionID: "session-2", callID: "call-2" },
      { args: {} },
    );
  } catch (error) {
    caught = error;
  }

  assert(
    caught === failure,
    "v1 before-tool callback failure must remain observable to the host",
  );
}

async function assertSuccessfulCompletionMapping(): Promise<void> {
  let observed: SuccessfulToolCompletionInput | undefined;
  const args = { name: "systematic-debugging" };
  const hook = createV1SuccessfulToolCompletionHook((input) => {
    observed = input;
  });

  await hook(
    {
      tool: "skill",
      sessionID: "session-3",
      callID: "call-3",
      args,
    },
    {
      title: "Loaded skill",
      output: "...",
      metadata: { source: "local" },
    },
  );

  assert(observed !== undefined, "successful v1 tool completion must be delivered");
  assert(observed.sessionID === "session-3", "session id must be preserved");
  assert(observed.tool === "skill", "tool id must be preserved");
  assert(observed.args === args, "tool args must preserve native identity");
  assert(
    Object.keys(observed).length === 3,
    "shared successful completion must not expose call/result fields not required by consumers",
  );
}

async function assertFailedTaskAfterHookIsFiltered(): Promise<void> {
  let completionCount = 0;
  const hook = createV1SuccessfulToolCompletionHook(() => {
    completionCount += 1;
  });

  await hook(
    {
      tool: "task",
      sessionID: "session-4",
      callID: "call-4",
      args: { subagent_type: "worker" },
    },
    undefined,
  );

  assert(
    completionCount === 0,
    "v1 Task failure after-hook must not become successful completion",
  );
}

async function assertCompletionFailureRemainsObservable(): Promise<void> {
  const failure = new Error("telemetry failed");
  const hook = createV1SuccessfulToolCompletionHook(() => {
    throw failure;
  });

  let caught: unknown;
  try {
    await hook(
      {
        tool: "skill",
        sessionID: "session-5",
        callID: "call-5",
        args: { name: "testing" },
      },
      { title: "skill", output: "done", metadata: {} },
    );
  } catch (error) {
    caught = error;
  }

  assert(
    caught === failure,
    "v1 successful-completion callback failure must remain observable to the host",
  );
}

void (async () => {
  await assertBeforeToolIsAwaited();
  await assertBeforeToolFailureBlocksHostHook();
  await assertSuccessfulCompletionMapping();
  await assertFailedTaskAfterHookIsFiltered();
  await assertCompletionFailureRemainsObservable();
})();
