import {
  AGENT_MODES,
  type AgentRegistrationContext,
} from "../../src/contract/agent-registration.js";
import {
  applyV2AgentDefinition,
  createV2AgentRegistrationCapability,
  unwrapV2AgentListResult,
  toV2AgentModelRef,
  type V2AgentEditor,
  type V2AgentInfo,
} from "../../src/adapters/v2/index.js";
import { InvalidHostContextError } from "../../src/contract/errors.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertJSONEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function v2AgentListLocation() {
  return {
    directory: "C:/repo",
    project: { id: "project", directory: "C:/repo", canonical: "C:/repo" },
  };
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

class FakeAgentDomain {
  readonly agents = new Map<string, V2AgentInfo>();
  transformCalls = 0;
  disposeCalls = 0;

  constructor(ids: readonly string[] = []) {
    for (const id of ids) this.agents.set(id, defaultAgent(id));
  }

  async list() {
    return {
      location: v2AgentListLocation(),
      data: [...this.agents.values()],
    };
  }

  async transform(update: (editor: V2AgentEditor) => void) {
    this.transformCalls += 1;
    const created: string[] = [];
    const editor: V2AgentEditor = {
      list: () => [...this.agents.values()],
      get: (id) => this.agents.get(id),
      default: () => {},
      update: (id, mutate) => {
        let agent = this.agents.get(id);
        if (agent === undefined) {
          agent = defaultAgent(id);
          this.agents.set(id, agent);
          created.push(id);
        }
        mutate(agent);
      },
      remove: (id) => {
        this.agents.delete(id);
      },
    };
    update(editor);
    let disposed = false;
    return {
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        this.disposeCalls += 1;
        for (const id of created) this.agents.delete(id);
      },
    };
  }
}

function assertStableV2FieldMapping(): void {
  const model = toV2AgentModelRef("openai/gpt-5.6-sol", "high");
  assertJSONEqual(
    model,
    { providerID: "openai", id: "gpt-5.6-sol", variant: "high" },
    "v2 model mapping must preserve provider, model id, and nested variant",
  );

  const target = defaultAgent("worker");
  target.request.settings = { existing: true };
  const options = { reasoningEffort: "high" };
  applyV2AgentDefinition(target, {
    id: "worker",
    definition: {
      model: { model: "openai/gpt-5.6-sol", variant: "high" },
      temperature: 0.2,
      topP: 0.8,
      prompt: "worker prompt",
      description: "worker description",
      mode: AGENT_MODES.subagent,
      hidden: true,
      options,
      color: "primary",
      steps: 12,
    },
    model,
  });

  assertJSONEqual(
    target.model,
    { providerID: "openai", id: "gpt-5.6-sol", variant: "high" },
    "v2 Agent mapping must preserve model selection",
  );
  assertJSONEqual(
    target.request.settings,
    {
      existing: true,
      reasoningEffort: "high",
      temperature: 0.2,
      topP: 0.8,
    },
    "v2 Agent mapping must merge request settings without rewriting options",
  );
  assert(target.system === "worker prompt", "v2 prompt must map to system");
  assert(target.description === "worker description", "v2 description must map directly");
  assert(target.mode === "subagent", "v2 mode must map directly");
  assert(target.hidden === true, "v2 hidden must map directly");
  assert(target.color === "primary", "v2 color must map directly");
  assert(target.steps === 12, "v2 steps must map directly");
  assert(
    target.permissions.length === 0,
    "Agent registration must not acquire permission-rule ownership",
  );
}

async function assertExistingAgentsAndAsyncPlanning(): Promise<void> {
  const domain = new FakeAgentDomain(["existing"]);
  let observed: AgentRegistrationContext | undefined;
  let release: (() => void) | undefined;
  const capability = createV2AgentRegistrationCapability(
    (context) =>
      new Promise((resolve) => {
        observed = context;
        release = () =>
          resolve({
            worker: {
              model: { model: "anthropic/claude-sonnet-4-5" },
              prompt: "worker",
              mode: AGENT_MODES.subagent,
            },
          });
      }),
  );

  let completed = false;
  const pending = Promise.resolve(capability.install({ agent: domain })).then(
    (cleanup) => {
      completed = true;
      return cleanup;
    },
  );

  await Promise.resolve();
  assert(observed !== undefined, "v2 registration provider must be invoked");
  assertJSONEqual(
    observed.existingAgentIDs,
    ["existing"],
    "v2 consumer must receive existing Agent IDs before mutation",
  );
  assert(Object.isFrozen(observed.existingAgentIDs), "existing IDs must be frozen");
  assert(domain.transformCalls === 0, "v2 transform must wait for async planning");
  assert(!completed, "capability installation must await registration planning");
  assert(release !== undefined, "async registration provider must have started");

  release();
  const cleanup = await pending;
  assert(Number(domain.transformCalls) === 1, "v2 transform must install after planning succeeds");
  assert(domain.agents.get("worker")?.system === "worker", "planned Agent must be registered");

  await cleanup?.();
  assert(domain.disposeCalls === 1, "v2 Agent transform cleanup must be owned by the capability");
}

async function assertInvalidModelFailsBeforeTransform(): Promise<void> {
  const domain = new FakeAgentDomain();
  const capability = createV2AgentRegistrationCapability(() => ({
    worker: {
      model: { model: "missing-provider-separator", variant: "high" },
    },
  }));

  let error: unknown;
  try {
    await capability.install({ agent: domain });
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof TypeError, "invalid canonical model ref must fail closed");
  assert(domain.transformCalls === 0, "invalid model ref must fail before host mutation");
}


function assertInvalidListEnvelopeFailsClosed(): void {
  let error: unknown;
  try {
    unwrapV2AgentListResult({
      location: v2AgentListLocation(),
      data: undefined as never,
    });
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof InvalidHostContextError,
    "malformed v2 AgentListOutput must fail as invalid host context",
  );
}

async function assertMissingDomainFailsClosed(): Promise<void> {
  const capability = createV2AgentRegistrationCapability(() => ({}));
  let error: unknown;
  try {
    await capability.install({});
  } catch (caught) {
    error = caught;
  }
  assert(
    error instanceof InvalidHostContextError,
    "missing v2 Agent domain must use invalid-host-context",
  );
}

void (async () => {
  assertStableV2FieldMapping();
  await assertExistingAgentsAndAsyncPlanning();
  await assertInvalidModelFailsBeforeTransform();
  assertInvalidListEnvelopeFailsClosed();
  await assertMissingDomainFailsClosed();
})();
