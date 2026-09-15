import {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  type CapabilitySupportMap,
} from "../../src/contract/capabilities.js";
import { AGENT_MODES } from "../../src/contract/agent-registration.js";
import { InvalidHostContextError } from "../../src/contract/errors.js";
import {
  createV2Adapter,
  createV2AgentPermissionRulesCapability,
  createV2AgentRegistrationCapability,
  toV2AgentPermissionRules,
  type V2AgentEditor,
  type V2AgentInfo,
  type V2AgentPermissionRule,
} from "../../src/adapters/v2/index.js";

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

const hostDefaults: readonly V2AgentPermissionRule[] = Object.freeze([
  Object.freeze({ action: "external_directory", resource: "*", effect: "ask" }),
]);

function defaultAgent(id: string): V2AgentInfo {
  return {
    id,
    request: { settings: {}, headers: {}, body: {} },
    mode: "primary",
    hidden: false,
    permissions: [...hostDefaults],
  };
}

class ReplayAgentDomain {
  private readonly base = new Map<string, V2AgentInfo>();
  private readonly transforms: Array<(editor: V2AgentEditor) => void> = [];
  readonly agents = new Map<string, V2AgentInfo>();
  transformCalls = 0;
  disposeCalls = 0;

  constructor(ids: readonly string[] = []) {
    for (const id of ids) this.base.set(id, defaultAgent(id));
    this.rebuild();
  }

  async list() {
    return {
      location: v2AgentListLocation(),
      data: [...this.agents.values()],
    };
  }

  async transform(update: (editor: V2AgentEditor) => void) {
    this.transformCalls += 1;
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
    for (const [id, agent] of this.base) {
      this.agents.set(id, {
        ...agent,
        request: {
          settings: { ...agent.request.settings },
          headers: { ...agent.request.headers },
          body: { ...agent.request.body },
        },
        permissions: [...agent.permissions],
      });
    }

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

function assertStablePermissionMapping(): void {
  const mapped = toV2AgentPermissionRules([
    {
      permission: "bash",
      rules: [
        { pattern: "*", action: "ask" },
        { pattern: "git *", action: "allow" },
      ],
    },
    {
      permission: "edit",
      rules: [{ pattern: "*", action: "deny" }],
    },
  ]);

  assertJSONEqual(
    mapped,
    [
      { action: "bash", resource: "*", effect: "ask" },
      { action: "bash", resource: "git *", effect: "allow" },
      { action: "edit", resource: "*", effect: "deny" },
    ],
    "v2 mapping must preserve group and pattern order exactly",
  );
}

function assertDuplicateNamespaceFailsClosed(): void {
  let error: unknown;
  try {
    toV2AgentPermissionRules([
      { permission: "bash", rules: [{ pattern: "*", action: "ask" }] },
      { permission: "bash", rules: [{ pattern: "git *", action: "allow" }] },
    ]);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof TypeError, "duplicate permission namespace must fail closed");
}

async function assertRulesAppendAfterHostDefaultsAndDispose(): Promise<void> {
  const domain = new ReplayAgentDomain(["worker"]);
  const capability = createV2AgentPermissionRulesCapability(() => ({
    worker: [
      {
        permission: "external_directory",
        rules: [{ pattern: "/workspace/**", action: "allow" }],
      },
      {
        permission: "bash",
        rules: [
          { pattern: "*", action: "ask" },
          { pattern: "git status", action: "allow" },
        ],
      },
    ],
  }));

  const cleanup = await capability.install({ agent: domain });
  assertJSONEqual(
    domain.agents.get("worker")?.permissions,
    [
      { action: "external_directory", resource: "*", effect: "ask" },
      { action: "external_directory", resource: "/workspace/**", effect: "allow" },
      { action: "bash", resource: "*", effect: "ask" },
      { action: "bash", resource: "git status", effect: "allow" },
    ],
    "consumer rules must follow host defaults so v2 last-match semantics are preserved",
  );

  await cleanup?.();
  assertJSONEqual(
    domain.agents.get("worker")?.permissions,
    hostDefaults,
    "disposing permission mapping must replay state without adapter-owned rules",
  );
}

async function assertMissingTargetFailsBeforeTransform(): Promise<void> {
  const domain = new ReplayAgentDomain();
  const capability = createV2AgentPermissionRulesCapability(() => ({
    missing: [{ permission: "bash", rules: [{ pattern: "*", action: "deny" }] }],
  }));

  let error: unknown;
  try {
    await capability.install({ agent: domain });
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof InvalidHostContextError,
    "missing permission target must use invalid-host-context",
  );
  assert(domain.transformCalls === 0, "missing target must fail before host mutation");
}

async function assertAsyncPlanningPrecedesTransform(): Promise<void> {
  const domain = new ReplayAgentDomain(["worker"]);
  let release: (() => void) | undefined;
  const capability = createV2AgentPermissionRulesCapability(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ worker: [] });
      }),
  );

  const pending = Promise.resolve(capability.install({ agent: domain }));
  await Promise.resolve();
  assert(domain.transformCalls === 0, "v2 permission transform must wait for async planning");
  assert(release !== undefined, "permission provider must have started");
  release();
  const cleanup = await pending;
  assert(Number(domain.transformCalls) === 1, "permission transform must install after planning");
  await cleanup?.();
}

async function assertRegistrationPrecedesPermissionRegardlessOfRequestOrder(): Promise<void> {
  const support = {
    [CAPABILITIES.serverLifecycle]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.hostEventDelivery]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.modelRequestGate]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.sessionAgentModelObservation]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.toolBeforeExecution]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.successfulToolCompletion]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.agentRegistration]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.agentPermissionRules]: CAPABILITY_SUPPORT.native,
    [CAPABILITIES.subagentDepth]: CAPABILITY_SUPPORT.unsupported,
    [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.unsupported,
  } satisfies CapabilitySupportMap;
  const domain = new ReplayAgentDomain();
  const adapter = createV2Adapter({
    capabilities: support,
    capabilityAdapters: [
      createV2AgentPermissionRulesCapability(() => ({
        worker: [{ permission: "bash", rules: [{ pattern: "*", action: "deny" }] }],
      })),
      createV2AgentRegistrationCapability(() => ({
        worker: { mode: AGENT_MODES.subagent },
      })),
    ],
  });

  const handle = await adapter.setup({
    context: { agent: domain },
    requiredCapabilities: [
      CAPABILITIES.agentPermissionRules,
      CAPABILITIES.agentRegistration,
    ],
  });

  assert(domain.agents.has("worker"), "registration must run before permission mapping");
  assertJSONEqual(
    domain.agents.get("worker")?.permissions,
    [
      { action: "external_directory", resource: "*", effect: "ask" },
      { action: "bash", resource: "*", effect: "deny" },
    ],
    "permission intent must apply to the Agent created by registration",
  );

  await handle.dispose();
  assert(!domain.agents.has("worker"), "adapter disposal must remove both replayable transforms");
}

async function assertMissingDomainFailsClosed(): Promise<void> {
  const capability = createV2AgentPermissionRulesCapability(() => ({}));
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
  assertStablePermissionMapping();
  assertDuplicateNamespaceFailsClosed();
  await assertRulesAppendAfterHostDefaultsAndDispose();
  await assertMissingTargetFailsBeforeTransform();
  await assertAsyncPlanningPrecedesTransform();
  await assertRegistrationPrecedesPermissionRegardlessOfRequestOrder();
  await assertMissingDomainFailsClosed();
})();
