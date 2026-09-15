export {
  AGENT_PERMISSION_ACTIONS,
  type AgentPermissionAction,
  type AgentPermissionPatternRule,
  type AgentPermissionRuleGroup,
  type AgentPermissionRules,
  type AgentPermissionRulesByAgent,
  type AgentPermissionRulesProvider,
} from "./contract/agent-permission.js";

export {
  AGENT_MODES,
  type AgentDefinition,
  type AgentDefinitions,
  type AgentMode,
  type AgentModelSelection,
  type AgentRegistration,
  type AgentRegistrationContext,
} from "./contract/agent-registration.js";

export {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  assertRequiredCapabilitiesSupported,
  normalizeRequiredCapabilities,
  type CapabilityId,
  type CapabilitySupport,
  type CapabilitySupportMap,
  type RequiredCapabilities,
} from "./contract/capabilities.js";

export {
  ADAPTER_DIAGNOSTIC_SEVERITY,
  type AdapterDiagnostic,
  type AdapterDiagnosticSeverity,
  type DiagnosticReporter,
} from "./contract/diagnostics.js";


export {
  type SubagentDepthRequirement,
} from "./contract/subagent-depth.js";

export {
  ADAPTER_ERROR_CATEGORY,
  AdapterInitializationError,
  InvalidHostContextError,
  UnsupportedCapabilityError,
  VersionAdapterError,
  type AdapterErrorCategory,
} from "./contract/errors.js";
export {
  type SuccessfulToolCompletion,
  type SuccessfulToolCompletionInput,
  type ToolBeforeExecution,
  type ToolBeforeExecutionInput,
} from "./contract/tool-execution.js";

export {
  type LocalWorkspaceTarget,
  type WorkspaceAdapter,
  type WorkspaceInfo,
  type WorkspaceRegistration,
} from "./contract/workspace-registration.js";

export {
  type HostEventDelivery,
  type HostEventDeliveryContext,
} from "./contract/host-event-delivery.js";

export {
  createAdapterHandle,
  type AdapterHandle,
  type Cleanup,
  type MaybePromise,
} from "./contract/lifecycle.js";

export {
  type ModelRequestGate,
  type ModelRequestIdentity,
  type SessionAgentModelObserver,
} from "./contract/model-request.js";

export {
  createOpenCodeServerPlugin,
  type OpenCodeServerBindings,
  type OpenCodeServerBindingsContext,
  type OpenCodeServerBindingsFactory,
  type OpenCodeServerPluginModule,
  type OpenCodeServerPluginOptions,
} from "./server-plugin.js";
