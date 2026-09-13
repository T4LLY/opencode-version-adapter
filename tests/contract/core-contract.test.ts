import {
  ADAPTER_ERROR_CATEGORY,
  AdapterInitializationError,
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  InvalidHostContextError,
  UnsupportedCapabilityError,
  VersionAdapterError,
  assertRequiredCapabilitiesSupported,
  type CapabilitySupportMap,
} from "../../src/index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// Synthetic map exercises all support states without claiming a generation mapping.
const support = {
  [CAPABILITIES.serverLifecycle]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.hostEventDelivery]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.modelRequestGate]: CAPABILITY_SUPPORT.emulated,
  [CAPABILITIES.sessionAgentModelObservation]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.toolBeforeExecution]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.successfulToolCompletion]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.agentRegistration]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.agentPermissionRules]: CAPABILITY_SUPPORT.emulated,
  [CAPABILITIES.subagentDepth]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.unsupported,
} satisfies CapabilitySupportMap;

assertRequiredCapabilitiesSupported(
  [CAPABILITIES.serverLifecycle, CAPABILITIES.modelRequestGate],
  support,
);

let unsupported: unknown;
try {
  assertRequiredCapabilitiesSupported([CAPABILITIES.subagentDepth], support);
} catch (error) {
  unsupported = error;
}

assert(
  unsupported instanceof UnsupportedCapabilityError,
  "required unsupported capability must fail with UnsupportedCapabilityError",
);
assert(
  unsupported instanceof VersionAdapterError,
  "unsupported capability error must remain inside the stable adapter error family",
);
assert(
  unsupported.category === ADAPTER_ERROR_CATEGORY.unsupportedCapability,
  "unsupported capability error must expose its stable semantic category",
);
assert(
  unsupported.capability === CAPABILITIES.subagentDepth,
  "unsupported capability error must retain the failed capability id",
);

const cause = new Error("native setup failed");
const initialization = new AdapterInitializationError("adapter setup failed", {
  cause,
});
assert(
  initialization.category === ADAPTER_ERROR_CATEGORY.initializationFailure,
  "initialization errors must expose the initialization-failure category",
);
assert(
  initialization.cause === cause,
  "initialization error must preserve a native diagnostic cause",
);

const invalidHost = new InvalidHostContextError("host context is not recognized");
assert(
  invalidHost.category === ADAPTER_ERROR_CATEGORY.invalidHostContext,
  "invalid host errors must expose the invalid-host-context category",
);
