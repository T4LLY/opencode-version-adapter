import { InvalidHostContextError } from "../../src/contract/errors";
import { createV1ConfigHook } from "../../src/adapters/v1/config";
import { createV1AgentRegistrationHandler } from "../../src/adapters/v1/capabilities/agent-registration";
import { createV1SubagentDepthHandler } from "../../src/adapters/v1/capabilities/subagent-depth";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRaisesDepthToConsumerMinimum(): Promise<void> {
  const config = { subagent_depth: 1 };
  const hook = createV1ConfigHook([
    createV1SubagentDepthHandler({ minimumDepth: 2 }),
  ]);

  await hook(config);

  assert(
    config.subagent_depth === 2,
    "v1 depth mapping must raise a smaller host depth to the consumer minimum",
  );
}

async function assertPreservesLargerExistingDepth(): Promise<void> {
  const config = { subagent_depth: 5 };
  const hook = createV1ConfigHook([
    createV1SubagentDepthHandler({ minimumDepth: 2 }),
  ]);

  await hook(config);

  assert(
    config.subagent_depth === 5,
    "v1 depth mapping must not reduce a larger host-configured depth",
  );
}

async function assertUsesV1DefaultWhenHostOmitsDepth(): Promise<void> {
  const config: { subagent_depth?: number } = {};
  const hook = createV1ConfigHook([
    createV1SubagentDepthHandler({ minimumDepth: 0 }),
  ]);

  await hook(config);

  assert(
    config.subagent_depth === 1,
    "v1 omitted depth must preserve OpenCode's effective default of one",
  );
}

function assertInvalidConsumerDepthFailsBeforeHookCreation(): void {
  let caught: unknown;
  try {
    createV1SubagentDepthHandler({ minimumDepth: -1 });
  } catch (error) {
    caught = error;
  }

  assert(
    caught instanceof TypeError,
    "negative consumer depth must fail before a config hook can mutate host state",
  );
}

async function assertInvalidHostDepthFailsClosed(): Promise<void> {
  const config = { subagent_depth: 1.5 };
  const hook = createV1ConfigHook([
    createV1SubagentDepthHandler({ minimumDepth: 2 }),
  ]);

  let caught: unknown;
  try {
    await hook(config);
  } catch (error) {
    caught = error;
  }

  assert(
    caught instanceof InvalidHostContextError,
    "invalid v1 host depth must fail as invalid host context",
  );
  assert(
    config.subagent_depth === 1.5,
    "invalid host depth must remain unchanged after failed staged config handling",
  );
}

async function assertConfigCompositionCommitsAtomically(): Promise<void> {
  const existingAgent = { prompt: "keep" };
  const config: {
    agent: Record<string, Record<string, unknown> | undefined>;
    subagent_depth: number;
  } = {
    agent: { existing: existingAgent },
    subagent_depth: 1,
  };
  const failure = new Error("late config planning failure");
  const hook = createV1ConfigHook([
    createV1AgentRegistrationHandler(() => ({
      worker: { prompt: "worker" },
    })),
    createV1SubagentDepthHandler({ minimumDepth: 2 }),
    () => {
      throw failure;
    },
  ]);

  let caught: unknown;
  try {
    await hook(config);
  } catch (error) {
    caught = error;
  }

  assert(caught === failure, "late config failure must remain observable");
  assert(
    config.agent.existing === existingAgent &&
      Object.keys(config.agent).length === 1,
    "late failure must not partially commit staged Agent registration",
  );
  assert(
    config.subagent_depth === 1,
    "late failure must not partially commit staged subagent depth",
  );
}

void (async () => {
  await assertRaisesDepthToConsumerMinimum();
  await assertPreservesLargerExistingDepth();
  await assertUsesV1DefaultWhenHostOmitsDepth();
  assertInvalidConsumerDepthFailsBeforeHookCreation();
  await assertInvalidHostDepthFailsClosed();
  await assertConfigCompositionCommitsAtomically();
})();
