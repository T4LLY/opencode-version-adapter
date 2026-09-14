export {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  assertRequiredCapabilitiesSupported,
  type CapabilityId,
  type CapabilitySupport,
  type CapabilitySupportMap,
  type RequiredCapabilities,
} from "./contract/capabilities";

export {
  ADAPTER_ERROR_CATEGORY,
  AdapterInitializationError,
  InvalidHostContextError,
  UnsupportedCapabilityError,
  VersionAdapterError,
  type AdapterErrorCategory,
} from "./contract/errors";
export {
  type SuccessfulToolCompletion,
  type SuccessfulToolCompletionInput,
  type ToolBeforeExecution,
  type ToolBeforeExecutionInput,
} from "./contract/tool-execution";
