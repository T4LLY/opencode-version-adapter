import {
  CAPABILITIES,
  type RequiredCapabilities,
} from "../../src/contract/capabilities.js";
import { createIntegratedV1ServerPlugin } from "../../src/adapters/v1/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const allV1Capabilities = [
  CAPABILITIES.serverLifecycle,
  CAPABILITIES.hostEventDelivery,
  CAPABILITIES.modelRequestGate,
  CAPABILITIES.sessionAgentModelObservation,
  CAPABILITIES.toolBeforeExecution,
  CAPABILITIES.successfulToolCompletion,
  CAPABILITIES.agentRegistration,
  CAPABILITIES.agentPermissionRules,
  CAPABILITIES.subagentDepth,
  CAPABILITIES.workspaceRegistration,
] as const satisfies RequiredCapabilities;

async function assertAllV1MappingsComposeBehindOneServer(): Promise<void> {
  const events: string[] = [];
  const plugin = createIntegratedV1ServerPlugin({
    requiredCapabilities: allV1Capabilities,
    bindings: {
      hostEventDelivery: (_event, { signal }) => {
        assert(!signal.aborted, "v1 host-owned event delivery signal must remain active");
        events.push("event");
      },
      modelRequestGate: () => {
        events.push("gate");
      },
      sessionAgentModelObservation: () => {
        events.push("observe");
      },
      toolBeforeExecution: () => {
        events.push("before");
      },
      successfulToolCompletion: () => {
        events.push("after");
      },
      agentRegistration: () => ({
        worker: {
          model: { model: "openai/gpt-5.6-sol", variant: "high" },
          mode: "subagent",
        },
      }),
      agentPermissionRules: () => ({
        worker: [
          {
            permission: "bash",
            rules: [{ pattern: "*", action: "allow" }],
          },
        ],
      }),
      subagentDepth: { minimumDepth: 4 },
      workspaceRegistration: {
        type: "demand",
        adapter: {
          name: "Demand",
          description: "Demand workspace",
          configure(info) {
            return info;
          },
          create() {},
          remove() {},
          target() {
            return { type: "local", directory: "/tmp/demand" };
          },
        },
      },
    },
  });

  const hooks = await plugin({
    experimental_workspace: {
      register(type) {
        events.push(`workspace:${type}`);
      },
    },
  });

  assert(
    events.join("|") === "workspace:demand",
    "integrated v1 setup must commit the irreversible workspace registration during server setup",
  );
  assert(hooks.event !== undefined, "event hook must be present");
  assert(hooks["chat.params"] !== undefined, "shared chat.params hook must be present");
  assert(hooks["tool.execute.before"] !== undefined, "before-tool hook must be present");
  assert(hooks["tool.execute.after"] !== undefined, "after-tool hook must be present");
  assert(hooks.config !== undefined, "config hook must be present");

  await hooks.event({ event: { type: "session.idle" } });
  await hooks["chat.params"](
    {
      sessionID: "session-1",
      agent: "worker",
      model: { id: "gpt-5.6-sol", providerID: "openai" },
    },
    {},
  );
  await hooks["tool.execute.before"](
    { tool: "bash", sessionID: "session-1", callID: "call-1" },
    { args: {} },
  );
  await hooks["tool.execute.after"](
    {
      tool: "bash",
      sessionID: "session-1",
      callID: "call-1",
      args: { command: "echo ok" },
    },
    { title: "done", output: "ok", metadata: {} },
  );

  const config: {
    agent?: Record<string, Record<string, unknown> | undefined>;
    subagent_depth?: number;
  } = {};
  await hooks.config(config);

  assert(
    events.join("|") === "workspace:demand|event|observe|gate|before|after",
    "integrated v1 hooks must preserve the independent semantic callbacks",
  );
  assert(config.subagent_depth === 4, "integrated config must apply subagent depth");
  assert(config.agent?.worker?.model === "openai/gpt-5.6-sol", "Agent registration must map the model");
  assert(config.agent?.worker?.variant === "high", "Agent registration must map the variant");
  assert(
    (config.agent?.worker?.permission as Record<string, unknown> | undefined)?.bash === "allow",
    "permission mapping must run after Agent registration in the shared config hook",
  );

  await hooks.dispose();
  await hooks.dispose();
}

async function assertObservationRunsBeforeRejectedGate(): Promise<void> {
  const events: string[] = [];
  const rejection = new Error("blocked");
  const plugin = createIntegratedV1ServerPlugin({
    requiredCapabilities: [
      CAPABILITIES.modelRequestGate,
      CAPABILITIES.sessionAgentModelObservation,
    ],
    bindings: {
      modelRequestGate: () => {
        events.push("gate");
        throw rejection;
      },
      sessionAgentModelObservation: () => {
        events.push("observe");
      },
    },
  });

  const hooks = await plugin({});
  assert(hooks["chat.params"] !== undefined, "chat.params hook must be present");

  let error: unknown;
  try {
    await hooks["chat.params"](
      {
        sessionID: "session-rejected",
        agent: "worker",
        model: { id: "gpt-5.6-sol", providerID: "openai" },
      },
      {},
    );
  } catch (caught) {
    error = caught;
  }

  assert(error === rejection, "v1 gate rejection must preserve the original failure");
  assert(
    events.join("|") === "observe|gate",
    "v1 observation must record the attempted identity before a gate rejection",
  );

  await hooks.dispose();
}

async function assertMissingBindingFailsBeforeWorkspaceMutation(): Promise<void> {
  let registrations = 0;
  const plugin = createIntegratedV1ServerPlugin({
    requiredCapabilities: [
      CAPABILITIES.hostEventDelivery,
      CAPABILITIES.workspaceRegistration,
    ],
    bindings: {
      workspaceRegistration: {
        type: "demand",
        adapter: {
          name: "Demand",
          description: "Demand",
          configure(info) {
            return info;
          },
          create() {},
          remove() {},
          target() {
            return { type: "local", directory: "/tmp/demand" };
          },
        },
      },
    },
  });

  let error: unknown;
  try {
    await plugin({
      experimental_workspace: {
        register() {
          registrations += 1;
        },
      },
    });
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof Error, "missing required v1 binding must fail");
  assert(
    registrations === 0,
    "missing v1 binding must be preflighted before irreversible workspace registration",
  );
}

void (async () => {
  await assertAllV1MappingsComposeBehindOneServer();
  await assertObservationRunsBeforeRejectedGate();
  await assertMissingBindingFailsBeforeWorkspaceMutation();
})();
