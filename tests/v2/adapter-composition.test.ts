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
  createV2Adapter,
  OPEN_CODE_V2_GENERATION,
  type V2CapabilityAdapter,
} from "../../src/adapters/v2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

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

interface TestContext {
  readonly events: string[];
}

function capabilityAdapter(
  capability:
    | typeof CAPABILITIES.serverLifecycle
    | typeof CAPABILITIES.hostEventDelivery
    | typeof CAPABILITIES.toolBeforeExecution,
  options: { fail?: boolean; cleanupFail?: boolean } = {},
): V2CapabilityAdapter<TestContext> {
  return {
    capability,
    install(context) {
      context.events.push(`install:${capability}`);
      if (options.fail === true) {
        throw new Error(`native failure:${capability}`);
      }

      return () => {
        context.events.push(`cleanup:${capability}`);
        if (options.cleanupFail === true) {
          throw new Error(`cleanup failure:${capability}`);
        }
      };
    },
  };
}

async function assertCompositionAndDisposal(): Promise<void> {
  const context: TestContext = { events: [] };
  const adapter = createV2Adapter({
    capabilities: support,
    capabilityAdapters: [
      capabilityAdapter(CAPABILITIES.serverLifecycle),
      capabilityAdapter(CAPABILITIES.hostEventDelivery),
      capabilityAdapter(CAPABILITIES.toolBeforeExecution),
    ],
  });

  assert(
    adapter.generation === OPEN_CODE_V2_GENERATION,
    "v2 adapter must identify its generation",
  );

  const handle = await adapter.setup({
    context,
    requiredCapabilities: [
      CAPABILITIES.serverLifecycle,
      CAPABILITIES.hostEventDelivery,
    ],
  });

  assert(
    context.events.join("|") ===
      "install:server-lifecycle|install:host-event-delivery",
    "v2 adapter must install only required capability mappings in request order",
  );

  await handle.dispose();
  await handle.dispose();

  assert(
    context.events.join("|") ===
      "install:server-lifecycle|install:host-event-delivery|cleanup:host-event-delivery|cleanup:server-lifecycle",
    "v2 disposal must be idempotent and release acquired resources in reverse order",
  );
}

async function assertPartialSetupRollback(): Promise<void> {
  const context: TestContext = { events: [] };
  const adapter = createV2Adapter({
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
    "v2 setup failures must use the stable initialization error category",
  );
  assert(
    error.category === ADAPTER_ERROR_CATEGORY.initializationFailure,
    "v2 setup failure must expose initialization-failure",
  );
  assert(
    error.cause instanceof Error &&
      error.cause.message === "native failure:host-event-delivery",
    "v2 setup failure must retain the native diagnostic cause",
  );
  assert(
    context.events.join("|") ===
      "install:server-lifecycle|install:host-event-delivery|cleanup:server-lifecycle",
    "v2 partial setup must roll back resources acquired before failure",
  );
}

async function assertUnsupportedPreflight(): Promise<void> {
  const context: TestContext = { events: [] };
  const adapter = createV2Adapter({
    capabilities: support,
    capabilityAdapters: [capabilityAdapter(CAPABILITIES.serverLifecycle)],
  });

  let error: unknown;
  try {
    await adapter.setup({
      context,
      requiredCapabilities: [CAPABILITIES.subagentDepth],
    });
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof UnsupportedCapabilityError,
    "unsupported v2 requirements must fail before capability setup",
  );
  assert(
    context.events.length === 0,
    "unsupported v2 requirements must not acquire resources",
  );
}

async function assertCleanupAttemptsEveryResource(): Promise<void> {
  const context: TestContext = { events: [] };
  const adapter = createV2Adapter({
    capabilities: support,
    capabilityAdapters: [
      capabilityAdapter(CAPABILITIES.serverLifecycle),
      capabilityAdapter(CAPABILITIES.hostEventDelivery, { cleanupFail: true }),
    ],
  });

  const handle = await adapter.setup({
    context,
    requiredCapabilities: [
      CAPABILITIES.serverLifecycle,
      CAPABILITIES.hostEventDelivery,
    ],
  });

  let error: unknown;
  try {
    await handle.dispose();
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof Error &&
      error.message === "cleanup failure:host-event-delivery",
    "v2 disposal must surface the first cleanup failure",
  );
  assert(
    context.events.includes("cleanup:server-lifecycle"),
    "v2 disposal must continue releasing earlier resources after a cleanup failure",
  );
}

(async () => {
  await assertCompositionAndDisposal();
  await assertPartialSetupRollback();
  await assertUnsupportedPreflight();
  await assertCleanupAttemptsEveryResource();
})();
