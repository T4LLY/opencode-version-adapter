import {
  CAPABILITIES,
  type RequiredCapabilities,
} from "../../src/contract/capabilities.js";
import {
  createIntegratedV2Adapter,
  type V2AgentEditor,
  type V2AgentInfo,
  type V2SessionHooks,
  type V2SessionHookRegistration,
  type V2ToolHooks,
  type V2ToolHookRegistration,
} from "../../src/adapters/v2/index.js";
import { AdapterInitializationError } from "../../src/contract/errors.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function defaultAgent(id: string): V2AgentInfo {
  return {
    id,
    request: { settings: {}, headers: {}, body: {} },
    mode: "primary",
    hidden: false,
    permissions: [],
  };
}

class FakeSessionDomain {
  readonly callbacks: Partial<{
    [Name in keyof V2SessionHooks]: (
      event: V2SessionHooks[Name],
    ) => void | Promise<void>;
  }> = {};
  readonly disposed: string[] = [];

  async hook<Name extends keyof V2SessionHooks>(
    name: Name,
    callback: (event: V2SessionHooks[Name]) => void | Promise<void>,
  ): Promise<V2SessionHookRegistration> {
    this.callbacks[name] = callback as never;
    return {
      dispose: async () => {
        this.disposed.push(name);
      },
    };
  }
}

class FakeToolDomain {
  readonly callbacks: Partial<{
    [Name in keyof V2ToolHooks]: (
      event: V2ToolHooks[Name],
    ) => void | Promise<void>;
  }> = {};
  readonly disposed: string[] = [];

  async hook<Name extends keyof V2ToolHooks>(
    name: Name,
    callback: (event: V2ToolHooks[Name]) => void | Promise<void>,
  ): Promise<V2ToolHookRegistration> {
    this.callbacks[name] = callback as never;
    return {
      dispose: async () => {
        this.disposed.push(name);
      },
    };
  }
}

function v2AgentListLocation() {
  return {
    directory: "C:/repo",
    project: { id: "project", directory: "C:/repo", canonical: "C:/repo" },
  };
}

class FakeAgentDomain {
  readonly agents = new Map<string, V2AgentInfo>();
  readonly transforms: Array<(editor: V2AgentEditor) => void> = [];
  disposeCalls = 0;

  async list() {
    return {
      location: v2AgentListLocation(),
      data: [...this.agents.values()],
    };
  }

  async transform(update: (editor: V2AgentEditor) => void) {
    this.transforms.push(update);
    this.rebuild();
    let disposed = false;
    return {
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        this.disposeCalls += 1;
        const index = this.transforms.indexOf(update);
        if (index >= 0) this.transforms.splice(index, 1);
        this.rebuild();
      },
    };
  }

  private rebuild(): void {
    this.agents.clear();
    const editor: V2AgentEditor = {
      list: () => [...this.agents.values()],
      get: (id) => this.agents.get(id),
      default: () => {},
      update: (id, mutate) => {
        let agent = this.agents.get(id);
        if (agent === undefined) {
          agent = defaultAgent(id);
          this.agents.set(id, agent);
        }
        mutate(agent);
      },
      remove: (id) => {
        this.agents.delete(id);
      },
    };

    for (const transform of this.transforms) transform(editor);
  }
}

function doneEventStream(): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          return { done: true as const, value: undefined };
        },
        async return() {
          return { done: true as const, value: undefined };
        },
      };
    },
  };
}

const supportedCapabilities = [
  CAPABILITIES.serverLifecycle,
  CAPABILITIES.hostEventDelivery,
  CAPABILITIES.modelRequestGate,
  CAPABILITIES.sessionAgentModelObservation,
  CAPABILITIES.toolBeforeExecution,
  CAPABILITIES.successfulToolCompletion,
  CAPABILITIES.agentRegistration,
  CAPABILITIES.agentPermissionRules,
] as const satisfies RequiredCapabilities;

async function assertAllSupportedMappingsComposeTogether(): Promise<void> {
  const session = new FakeSessionDomain();
  const tool = new FakeToolDomain();
  const agent = new FakeAgentDomain();

  const adapter = createIntegratedV2Adapter({
    hostEventDelivery: () => {},
    modelRequestGate: () => {},
    sessionAgentModelObservation: () => {},
    toolBeforeExecution: () => {},
    successfulToolCompletion: () => {},
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
  });

  const handle = await adapter.setup({
    requiredCapabilities: supportedCapabilities,
    context: {
      event: { subscribe: doneEventStream },
      session,
      tool,
      agent,
    },
  });

  assert(
    session.callbacks["model.request"] !== undefined &&
      session.callbacks.context !== undefined,
    "integrated v2 adapter must install both independent session mappings",
  );
  assert(
    tool.callbacks["execute.before"] !== undefined &&
      tool.callbacks["execute.after"] !== undefined,
    "integrated v2 adapter must install both tool mappings",
  );
  assert(agent.transforms.length === 2, "registration and permission transforms must both install");
  assert(agent.agents.has("worker"), "permission mapping must run after Agent registration");
  assert(
    agent.agents.get("worker")?.permissions.at(-1)?.action === "bash",
    "integrated permission mapping must reach the registered Agent",
  );

  await handle.dispose();
  assert(agent.disposeCalls === 2, "integrated disposal must release both Agent transforms");
  assert(
    tool.disposed.join("|") === "execute.after|execute.before",
    "integrated disposal must release tool registrations in reverse setup order",
  );
  assert(
    session.disposed.join("|") === "context|model.request",
    "integrated disposal must release session registrations in reverse setup order",
  );
}

async function assertUnboundRequiredCapabilityFailsBeforeHostMutation(): Promise<void> {
  let subscriptions = 0;
  const adapter = createIntegratedV2Adapter({
    hostEventDelivery: () => {},
  });
  let error: unknown;

  try {
    await adapter.setup({
      requiredCapabilities: [
        CAPABILITIES.hostEventDelivery,
        CAPABILITIES.modelRequestGate,
      ],
      context: {
        event: {
          subscribe() {
            subscriptions += 1;
            return doneEventStream();
          },
        },
      },
    });
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof AdapterInitializationError,
    "a supported capability without a consumer binding must fail explicitly",
  );
  assert(
    subscriptions === 0,
    "missing v2 bindings must fail before an earlier required mapping acquires host resources",
  );
}

void (async () => {
  await assertAllSupportedMappingsComposeTogether();
  await assertUnboundRequiredCapabilityFailsBeforeHostMutation();
})();
