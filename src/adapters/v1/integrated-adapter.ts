import type { AgentPermissionRulesProvider } from "../../contract/agent-permission.js";
import type { AgentRegistration } from "../../contract/agent-registration.js";
import {
  CAPABILITIES,
  type CapabilityId,
  type RequiredCapabilities,
} from "../../contract/capabilities.js";
import type { DiagnosticReporter } from "../../contract/diagnostics.js";
import type { Cleanup } from "../../contract/lifecycle.js";
import type { HostEventDelivery } from "../../contract/host-event-delivery.js";
import type {
  ModelRequestGate,
  SessionAgentModelObserver,
} from "../../contract/model-request.js";
import type { SubagentDepthRequirement } from "../../contract/subagent-depth.js";
import type {
  SuccessfulToolCompletion,
  ToolBeforeExecution,
} from "../../contract/tool-execution.js";
import type { WorkspaceRegistration } from "../../contract/workspace-registration.js";
import {
  createV1Adapter,
  type V1CapabilityAdapter,
} from "./adapter.js";
import { createV1AgentPermissionRulesHandler } from "./capabilities/agent-permission-rules.js";
import { createV1AgentRegistrationHandler } from "./capabilities/agent-registration.js";
import {
  createV1HostEventHook,
  type V1EventHook,
} from "./capabilities/host-event-delivery.js";
import { createV1ModelRequestGateHandler } from "./capabilities/model-request-gate.js";
import {
  createV1DisposeHook,
  type V1DisposeHook,
} from "./capabilities/server-lifecycle.js";
import { createV1SessionAgentModelObservationHandler } from "./capabilities/session-agent-model-observation.js";
import { createV1SubagentDepthHandler } from "./capabilities/subagent-depth.js";
import {
  createV1SuccessfulToolCompletionHook,
  type V1ToolExecuteAfterHook,
} from "./capabilities/successful-tool-completion.js";
import {
  createV1ToolBeforeExecutionHook,
  type V1ToolExecuteBeforeHook,
} from "./capabilities/tool-before-execution.js";
import {
  createV1WorkspaceRegistrationCapability,
  type V1WorkspaceRegistrationContext,
} from "./capabilities/workspace-registration.js";
import {
  createV1ChatParamsHook,
  type V1ChatParamsHandler,
  type V1ChatParamsHook,
} from "./chat-params.js";
import {
  createV1ConfigHook,
  type V1ConfigHandler,
  type V1ConfigHook,
} from "./config.js";
import {
  resolveV1DiagnosticReporter,
  type V1DiagnosticContext,
} from "./diagnostics.js";
import { OPEN_CODE_V1_CAPABILITY_SUPPORT } from "./support.js";

/** Consumer-owned semantic handlers for the approved OpenCode v1 capability set. */
export interface V1CapabilityBindings {
  readonly lifecycleCleanup?: Cleanup;
  readonly hostEventDelivery?: HostEventDelivery;
  readonly modelRequestGate?: ModelRequestGate;
  readonly sessionAgentModelObservation?: SessionAgentModelObserver;
  readonly toolBeforeExecution?: ToolBeforeExecution;
  readonly successfulToolCompletion?: SuccessfulToolCompletion;
  readonly agentRegistration?: AgentRegistration;
  readonly agentPermissionRules?: AgentPermissionRulesProvider;
  readonly subagentDepth?: SubagentDepthRequirement;
  readonly workspaceRegistration?: WorkspaceRegistration;
}

/** Narrow v1 PluginInput subset required by the approved mappings. */
export interface V1IntegratedContext
  extends V1WorkspaceRegistrationContext,
    V1DiagnosticContext {}

/** Narrow v1 Hooks subset emitted by the integrated server mapping. */
export interface V1IntegratedHooks {
  readonly dispose: V1DisposeHook;
  readonly event?: V1EventHook;
  readonly "chat.params"?: V1ChatParamsHook;
  readonly "tool.execute.before"?: V1ToolExecuteBeforeHook;
  readonly "tool.execute.after"?: V1ToolExecuteAfterHook;
  readonly config?: V1ConfigHook;
}

export type V1IntegratedServerPlugin = (
  context: V1IntegratedContext,
) => Promise<V1IntegratedHooks>;

export interface V1IntegratedServerOptions {
  readonly requiredCapabilities: RequiredCapabilities;
  readonly bindings: V1CapabilityBindings;
  readonly diagnostics?: DiagnosticReporter;
}

/**
 * Assemble the evidence-backed v1 mappings into one native `server(input)`
 * plugin function. Shared hooks (`chat.params` and `config`) remain composed
 * from independent semantic handlers; consumer policy does not enter here.
 */
export function createIntegratedV1ServerPlugin(
  options: V1IntegratedServerOptions,
): V1IntegratedServerPlugin {
  const required = new Set<CapabilityId>(options.requiredCapabilities);
  const capabilityAdapters: V1CapabilityAdapter<V1IntegratedContext>[] = [
    lifecycleCapability(options.bindings.lifecycleCleanup),
  ];
  const hooks: {
    event?: V1EventHook;
    "chat.params"?: V1ChatParamsHook;
    "tool.execute.before"?: V1ToolExecuteBeforeHook;
    "tool.execute.after"?: V1ToolExecuteAfterHook;
    config?: V1ConfigHook;
  } = {};

  if (
    required.has(CAPABILITIES.hostEventDelivery) &&
    options.bindings.hostEventDelivery !== undefined
  ) {
    capabilityAdapters.push(passiveCapability(CAPABILITIES.hostEventDelivery));
    hooks.event = createV1HostEventHook(options.bindings.hostEventDelivery);
  }

  const chatParamsHandlers: V1ChatParamsHandler[] = [];
  if (
    required.has(CAPABILITIES.sessionAgentModelObservation) &&
    options.bindings.sessionAgentModelObservation !== undefined
  ) {
    capabilityAdapters.push(
      passiveCapability(CAPABILITIES.sessionAgentModelObservation),
    );
    chatParamsHandlers.push(
      createV1SessionAgentModelObservationHandler(
        options.bindings.sessionAgentModelObservation,
      ),
    );
  }
  if (
    required.has(CAPABILITIES.modelRequestGate) &&
    options.bindings.modelRequestGate !== undefined
  ) {
    capabilityAdapters.push(passiveCapability(CAPABILITIES.modelRequestGate));
    chatParamsHandlers.push(
      createV1ModelRequestGateHandler(options.bindings.modelRequestGate),
    );
  }
  if (chatParamsHandlers.length > 0) {
    hooks["chat.params"] = createV1ChatParamsHook(chatParamsHandlers);
  }

  if (
    required.has(CAPABILITIES.toolBeforeExecution) &&
    options.bindings.toolBeforeExecution !== undefined
  ) {
    capabilityAdapters.push(passiveCapability(CAPABILITIES.toolBeforeExecution));
    hooks["tool.execute.before"] = createV1ToolBeforeExecutionHook(
      options.bindings.toolBeforeExecution,
    );
  }
  if (
    required.has(CAPABILITIES.successfulToolCompletion) &&
    options.bindings.successfulToolCompletion !== undefined
  ) {
    capabilityAdapters.push(
      passiveCapability(CAPABILITIES.successfulToolCompletion),
    );
    hooks["tool.execute.after"] = createV1SuccessfulToolCompletionHook(
      options.bindings.successfulToolCompletion,
    );
  }

  const configHandlers: V1ConfigHandler[] = [];
  if (
    required.has(CAPABILITIES.agentRegistration) &&
    options.bindings.agentRegistration !== undefined
  ) {
    capabilityAdapters.push(passiveCapability(CAPABILITIES.agentRegistration));
    configHandlers.push(
      createV1AgentRegistrationHandler(options.bindings.agentRegistration),
    );
  }
  if (
    required.has(CAPABILITIES.agentPermissionRules) &&
    options.bindings.agentPermissionRules !== undefined
  ) {
    capabilityAdapters.push(
      passiveCapability(CAPABILITIES.agentPermissionRules),
    );
    configHandlers.push(
      createV1AgentPermissionRulesHandler(options.bindings.agentPermissionRules),
    );
  }
  if (
    required.has(CAPABILITIES.subagentDepth) &&
    options.bindings.subagentDepth !== undefined
  ) {
    configHandlers.push(createV1SubagentDepthHandler(options.bindings.subagentDepth));
    capabilityAdapters.push(passiveCapability(CAPABILITIES.subagentDepth));
  }
  if (configHandlers.length > 0) {
    hooks.config = createV1ConfigHook(configHandlers);
  }

  if (
    required.has(CAPABILITIES.workspaceRegistration) &&
    options.bindings.workspaceRegistration !== undefined
  ) {
    capabilityAdapters.push(
      createV1WorkspaceRegistrationCapability(
        options.bindings.workspaceRegistration,
      ) as V1CapabilityAdapter<V1IntegratedContext>,
    );
  }

  const adapter = createV1Adapter<V1IntegratedContext>({
    capabilities: OPEN_CODE_V1_CAPABILITY_SUPPORT,
    capabilityAdapters,
  });

  return async (context) => {
    const handle = await adapter.setup({
      context,
      requiredCapabilities: options.requiredCapabilities,
      diagnostics: resolveV1DiagnosticReporter(context, options.diagnostics),
    });

    return {
      ...hooks,
      dispose: createV1DisposeHook(handle),
    };
  };
}

function lifecycleCapability(
  cleanup?: Cleanup,
): V1CapabilityAdapter<V1IntegratedContext> {
  return {
    capability: CAPABILITIES.serverLifecycle,
    install() {
      return cleanup;
    },
  };
}

function passiveCapability(
  capability: CapabilityId,
): V1CapabilityAdapter<V1IntegratedContext> {
  return {
    capability,
    install() {},
  };
}
