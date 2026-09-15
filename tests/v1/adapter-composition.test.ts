import {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  type CapabilitySupportMap,
} from "../../src/contract/capabilities";
import type { AdapterDiagnostic } from "../../src/contract/diagnostics";
import {
  ADAPTER_ERROR_CATEGORY,
  AdapterInitializationError,
  UnsupportedCapabilityError,
} from "../../src/contract/errors";
import {
  createV1Adapter,
  OPEN_CODE_V1_GENERATION,
  type V1CapabilityAdapter,
} from "../../src/adapters/v1";
import {
  createV1WorkspaceRegistrationCapability,
  type V1WorkspaceRegistrationContext,
} from "../../src/adapters/v1/capabilities/workspace-registration";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const support = {
  [CAPABILITIES.serverLifecycle]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.hostEventDelivery]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.modelRequestGate]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.sessionAgentModelObservation]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.toolBeforeExecution]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.successfulToolCompletion]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.agentRegistration]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.agentPermissionRules]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.subagentDepth]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.unsupported,
} satisfies CapabilitySupportMap;

interface TestContext {
  readonly events: string[];
}

function capabilityAdapter(
  capability:
    | typeof CAPABILITIES.serverLifecycle
    | typeof CAPABILITIES.hostEventDelivery
    | typeof CAPABILITIES.toolBeforeExecution,
  options: { fail?: boolean } = {},
): V1CapabilityAdapter<TestContext> {
  return {
    capability,
    install(context) {
      context.events.push(`install:${capability}`);
      if (options.fail === true) {
        throw new Error(`native failure:${capability}`);
      }

      return () => {
        context.events.push(`cleanup:${capability}`);
      };
    },
  };
}

async function assertCompositionAndDisposal(): Promise<void> {
  const context: TestContext = { events: [] };
  const adapter = createV1Adapter({
    capabilities: support,
    capabilityAdapters: [
      capabilityAdapter(CAPABILITIES.serverLifecycle),
      capabilityAdapter(CAPABILITIES.hostEventDelivery),
      capabilityAdapter(CAPABILITIES.toolBeforeExecution),
    ],
  });

  assert(
    adapter.generation === OPEN_CODE_V1_GENERATION,
    "v1 adapter must identify its generation",
  );

  const handle = await adapter.setup({
    context,
    requiredCapabilities: [
      CAPABILITIES.serverLifecycle,
      CAPABILITIES.hostEventDelivery,
    ],
  });

  assert(
    context.events.length === 2 &&
      context.events.includes("install:server-lifecycle") &&
      context.events.includes("install:host-event-delivery") &&
      !context.events.includes("install:tool-before-execution"),
    "v1 adapter must install only required capability mappings",
  );

  await handle.dispose();
  await handle.dispose();

  const cleanupEvents = context.events.filter((event) =>
    event.startsWith("cleanup:"),
  );
  assert(
    cleanupEvents.length === 2 &&
      cleanupEvents.includes("cleanup:server-lifecycle") &&
      cleanupEvents.includes("cleanup:host-event-delivery"),
    "v1 adapter must own one idempotent cleanup for every acquired resource",
  );
}


async function assertDuplicateRequirementsAreDeduplicated(): Promise<void> {
  const context: TestContext = { events: [] };
  const diagnostics: AdapterDiagnostic[] = [];
  const adapter = createV1Adapter({
    capabilities: support,
    capabilityAdapters: [
      capabilityAdapter(CAPABILITIES.serverLifecycle),
      capabilityAdapter(CAPABILITIES.hostEventDelivery),
    ],
  });

  const handle = await adapter.setup({
    context,
    requiredCapabilities: [
      CAPABILITIES.serverLifecycle,
      CAPABILITIES.hostEventDelivery,
      CAPABILITIES.serverLifecycle,
      CAPABILITIES.serverLifecycle,
      CAPABILITIES.hostEventDelivery,
    ],
    diagnostics(diagnostic) {
      diagnostics.push(diagnostic);
    },
  });

  assert(
    context.events.join("|") ===
      "install:server-lifecycle|install:host-event-delivery",
    "v1 duplicate requirements must install each capability once in first-occurrence order",
  );
  assert(
    diagnostics.length === 2 &&
      diagnostics[0]?.code === "duplicate-required-capability" &&
      diagnostics[0]?.capability === CAPABILITIES.serverLifecycle &&
      diagnostics[1]?.code === "duplicate-required-capability" &&
      diagnostics[1]?.capability === CAPABILITIES.hostEventDelivery,
    "v1 must emit one structured warning per duplicated capability id",
  );

  await handle.dispose();
  assert(
    context.events.join("|") ===
      "install:server-lifecycle|install:host-event-delivery|cleanup:host-event-delivery|cleanup:server-lifecycle",
    "v1 duplicate requirements must not create duplicate cleanup ownership",
  );
}

async function assertPartialSetupRollback(): Promise<void> {
  const context: TestContext = { events: [] };
  const nativeFailure = "native failure:host-event-delivery";
  const adapter = createV1Adapter({
    capabilities: support,
    capabilityAdapters: [
      capabilityAdapter(CAPABILITIES.serverLifecycle),
      capabilityAdapter(CAPABILITIES.hostEventDelivery, { fail: true }),
    ],
  });

  let error: unknown;
  try {
    await adapter.setup({
      context,
      requiredCapabilities: [
        CAPABILITIES.serverLifecycle,
        CAPABILITIES.hostEventDelivery,
      ],
    });
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof AdapterInitializationError,
    "v1 setup failures must use the stable initialization error category",
  );
  assert(
    error.category === ADAPTER_ERROR_CATEGORY.initializationFailure,
    "v1 setup failure must expose initialization-failure",
  );
  assert(
    error.cause instanceof Error && error.cause.message === nativeFailure,
    "v1 setup failure must retain the native diagnostic cause",
  );
  assert(
    context.events.join("|") ===
      "install:server-lifecycle|install:host-event-delivery|cleanup:server-lifecycle",
    "v1 partial setup must roll back resources acquired before failure",
  );
}

async function assertUnsupportedPreflight(): Promise<void> {
  const context: TestContext = { events: [] };
  const adapter = createV1Adapter({
    capabilities: support,
    capabilityAdapters: [capabilityAdapter(CAPABILITIES.serverLifecycle)],
  });

  let error: unknown;
  try {
    await adapter.setup({
      context,
      requiredCapabilities: [CAPABILITIES.modelRequestGate],
    });
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof UnsupportedCapabilityError,
    "unsupported v1 requirements must fail before capability setup",
  );
  assert(
    context.events.length === 0,
    "unsupported v1 requirements must not acquire resources",
  );
}


async function assertIrreversibleWorkspaceRegistrationCommitsLast(): Promise<void> {
  interface WorkspaceContext extends TestContext, V1WorkspaceRegistrationContext {}

  const workspaceSupport = {
    ...support,
    [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.native,
  } satisfies CapabilitySupportMap;
  const events: string[] = [];
  const context: WorkspaceContext = {
    events,
    experimental_workspace: {
      register(type) {
        events.push(`register:${type}`);
      },
    },
  };
  const workspace = createV1WorkspaceRegistrationCapability({
    type: "demand",
    adapter: {
      name: "Demand Workspace",
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
  });
  const reversible: V1CapabilityAdapter<WorkspaceContext> = {
    capability: CAPABILITIES.serverLifecycle,
    install(input) {
      input.events.push("install:server-lifecycle");
      return () => {
        input.events.push("cleanup:server-lifecycle");
      };
    },
  };
  const adapter = createV1Adapter<WorkspaceContext>({
    capabilities: workspaceSupport,
    capabilityAdapters: [workspace, reversible],
  });

  const handle = await adapter.setup({
    context,
    requiredCapabilities: [
      CAPABILITIES.workspaceRegistration,
      CAPABILITIES.serverLifecycle,
    ],
  });

  assert(
    events.join("|") === "install:server-lifecycle|register:demand",
    "v1 must defer irreversible Workspace registration until reversible setup succeeds",
  );

  await handle.dispose();
  assert(
    events.join("|") ===
      "install:server-lifecycle|register:demand|cleanup:server-lifecycle",
    "dispose must release owned resources without fabricating Workspace unregister",
  );
}

async function assertWorkspaceRegistrationIsSkippedWhenEarlierSetupFails(): Promise<void> {
  interface WorkspaceContext extends TestContext, V1WorkspaceRegistrationContext {}

  const workspaceSupport = {
    ...support,
    [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.native,
  } satisfies CapabilitySupportMap;
  const events: string[] = [];
  const context: WorkspaceContext = {
    events,
    experimental_workspace: {
      register(type) {
        events.push(`register:${type}`);
      },
    },
  };
  const workspace = createV1WorkspaceRegistrationCapability({
    type: "demand",
    adapter: {
      name: "Demand Workspace",
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
  });
  const failing: V1CapabilityAdapter<WorkspaceContext> = {
    capability: CAPABILITIES.serverLifecycle,
    install(input) {
      input.events.push("install:server-lifecycle");
      throw new Error("reversible setup failed");
    },
  };
  const adapter = createV1Adapter<WorkspaceContext>({
    capabilities: workspaceSupport,
    capabilityAdapters: [workspace, failing],
  });

  let error: unknown;
  try {
    await adapter.setup({
      context,
      requiredCapabilities: [
        CAPABILITIES.workspaceRegistration,
        CAPABILITIES.serverLifecycle,
      ],
    });
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof AdapterInitializationError, "setup failure must remain categorized");
  assert(
    events.join("|") === "install:server-lifecycle",
    "failed reversible setup must not commit Workspace registration",
  );
}

void (async () => {
  await assertCompositionAndDisposal();
  await assertDuplicateRequirementsAreDeduplicated();
  await assertPartialSetupRollback();
  await assertUnsupportedPreflight();
  await assertIrreversibleWorkspaceRegistrationCommitsLast();
  await assertWorkspaceRegistrationIsSkippedWhenEarlierSetupFails();
})();
