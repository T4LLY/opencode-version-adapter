import {
  AGENT_MODES,
  type AgentRegistrationContext,
} from "../../src/contract/agent-registration";
import { createV1ConfigHook } from "../../src/adapters/v1/config";
import {
  createV1AgentRegistrationHandler,
  toV1AgentConfig,
} from "../../src/adapters/v1/capabilities/agent-registration";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertJSONEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assertStableFieldMapping(): void {
  const options = { reasoningEffort: "high" };
  const mapped = toV1AgentConfig({
    model: "openai/gpt-5.6-sol",
    variant: "high",
    temperature: 0.2,
    topP: 0.8,
    prompt: "worker prompt",
    description: "worker description",
    mode: AGENT_MODES.subagent,
    hidden: false,
    options,
    color: "primary",
    steps: 12,
  });

  assertJSONEqual(
    mapped,
    {
      model: "openai/gpt-5.6-sol",
      variant: "high",
      temperature: 0.2,
      top_p: 0.8,
      prompt: "worker prompt",
      description: "worker description",
      mode: "subagent",
      hidden: false,
      options,
      color: "primary",
      steps: 12,
    },
    "v1 Agent mapping must preserve approved fields and translate topP to top_p",
  );
  assert(
    mapped.options === options,
    "v1 Agent mapping must not rewrite provider-specific options",
  );
  assert(
    !Object.hasOwn(mapped, "permission"),
    "Agent registration must not acquire permission-rule ownership",
  );
}

async function assertExistingAgentsAreVisibleBeforeMutation(): Promise<void> {
  let observed: AgentRegistrationContext | undefined;
  const existingAgent = { prompt: "keep" };
  const config: {
    agent: Record<string, Record<string, unknown> | undefined>;
  } = { agent: { existing: existingAgent } };
  const hook = createV1ConfigHook([
    createV1AgentRegistrationHandler((context) => {
      observed = context;
      return {
        orchestrator: {
          prompt: "root prompt",
          mode: AGENT_MODES.primary,
        },
        worker: {
          prompt: "worker prompt",
          description: "worker description",
          mode: AGENT_MODES.subagent,
        },
      };
    }),
  ]);

  await hook(config);

  assert(observed !== undefined, "registration provider must be invoked");
  assertJSONEqual(
    observed.existingAgentIDs,
    ["existing"],
    "consumer must receive existing v1 Agent IDs for collision policy",
  );
  assert(
    Object.isFrozen(observed.existingAgentIDs),
    "existing Agent IDs must be a read-only registration snapshot",
  );
  assert(
    config.agent.existing === existingAgent,
    "unrelated existing Agent definitions must remain untouched",
  );
  assert(
    config.agent.orchestrator?.mode === "primary" &&
      config.agent.worker?.mode === "subagent",
    "consumer-provided Agents must be registered under their exact IDs",
  );
}

async function assertConsumerOwnsCollisionDecision(): Promise<void> {
  const existingAgent = { prompt: "user-owned" };
  const config: {
    agent: Record<string, Record<string, unknown> | undefined>;
  } = { agent: { orchestrator: existingAgent } };
  const collision = new Error("FOA Agent collision: orchestrator");
  const hook = createV1ConfigHook([
    createV1AgentRegistrationHandler(({ existingAgentIDs }) => {
      if (existingAgentIDs.includes("orchestrator")) {
        throw collision;
      }
      return {};
    }),
  ]);

  let caught: unknown;
  try {
    await hook(config);
  } catch (error) {
    caught = error;
  }

  assert(caught === collision, "consumer collision failure must remain observable");
  assert(
    config.agent.orchestrator === existingAgent &&
      Object.keys(config.agent).length === 1,
    "registration failure before planning completes must not mutate host Agent config",
  );
}

async function assertAsyncRegistrationIsAwaited(): Promise<void> {
  let release: (() => void) | undefined;
  let completed = false;
  const config: {
    agent?: Record<string, Record<string, unknown> | undefined>;
  } = {};
  const hook = createV1ConfigHook([
    createV1AgentRegistrationHandler(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              worker: {
                prompt: "worker prompt",
                mode: AGENT_MODES.subagent,
              },
            });
        }),
    ),
  ]);

  const pending = hook(config).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(!completed, "v1 config hook must await Agent registration planning");
  assert(release !== undefined, "async registration provider must have started");

  release();
  await pending;
  assert(completed, "v1 config hook must continue after registration resolves");
  assert(config.agent?.worker?.mode === "subagent", "resolved Agent must be registered");
}

void (async () => {
  assertStableFieldMapping();
  await assertExistingAgentsAreVisibleBeforeMutation();
  await assertConsumerOwnsCollisionDecision();
  await assertAsyncRegistrationIsAwaited();
})();
