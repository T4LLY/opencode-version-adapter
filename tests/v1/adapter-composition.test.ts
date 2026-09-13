import {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  type CapabilitySupportMap,
} from "../../src/contract/capabilities";
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

void (async () => {
  await assertCompositionAndDisposal();
  await assertPartialSetupRollback();
  await assertUnsupportedPreflight();
})();
