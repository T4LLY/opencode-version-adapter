import type { AgentPermissionRulesProvider } from "../contract/agent-permission";
import type { AgentRegistration } from "../contract/agent-registration";
import type { RequiredCapabilities } from "../contract/capabilities";
import type { DiagnosticReporter } from "../contract/diagnostics";
import type { HostEventDelivery } from "../contract/host-event-delivery";
import type { Cleanup, MaybePromise } from "../contract/lifecycle";
import type {
  ModelRequestGate,
  SessionAgentModelObserver,
} from "../contract/model-request";
import type { SubagentDepthRequirement } from "../contract/subagent-depth";
import type {
  SuccessfulToolCompletion,
  ToolBeforeExecution,
} from "../contract/tool-execution";
import type { WorkspaceRegistration } from "../contract/workspace-registration";
import {
  createIntegratedV1ServerPlugin,
  type V1IntegratedContext,
  type V1IntegratedHooks,
} from "../adapters/v1/integrated-adapter";
import { createIntegratedV2Adapter } from "../adapters/v2/integrated-adapter";
import { createV2ServerDefinition } from "../adapters/v2/capabilities/server-lifecycle";
import type { V2IntegratedContext } from "../adapters/v2/integrated-adapter";

/**
 * Generation-independent semantic bindings accepted by the candidate server
 * entrypoint. A binding is activated only when its capability is required.
 */
export interface OpenCodeServerBindings {
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

export interface OpenCodeServerPluginOptions {
  readonly id: string;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly bindings: OpenCodeServerBindings;
  readonly diagnostics?: DiagnosticReporter;
}

/**
 * One module shape intentionally readable by both pinned OpenCode loaders.
 *
 * OpenCode v1.18.30 selects `server()` and ignores `setup`. OpenCode v2.0.3
 * decodes `id` + `setup()` and ignores the extra `server` member. Consumers
 * default-export this value and do not select a generation themselves.
 */
export interface OpenCodeServerPluginModule {
  readonly id: string;
  readonly server: (context: V1IntegratedContext) => Promise<V1IntegratedHooks>;
  readonly setup: (context: V2IntegratedContext) => MaybePromise<Cleanup | void>;
}

export function createOpenCodeServerPlugin(
  options: OpenCodeServerPluginOptions,
): OpenCodeServerPluginModule {
  const server = createIntegratedV1ServerPlugin({
    requiredCapabilities: options.requiredCapabilities,
    bindings: options.bindings,
    diagnostics: options.diagnostics,
  });
  const v2 = createV2ServerDefinition<V2IntegratedContext>({
    id: options.id,
    requiredCapabilities: options.requiredCapabilities,
    diagnostics: options.diagnostics,
    adapter: createIntegratedV2Adapter({
      hostEventDelivery: options.bindings.hostEventDelivery,
      modelRequestGate: options.bindings.modelRequestGate,
      sessionAgentModelObservation:
        options.bindings.sessionAgentModelObservation,
      toolBeforeExecution: options.bindings.toolBeforeExecution,
      successfulToolCompletion: options.bindings.successfulToolCompletion,
      agentRegistration: options.bindings.agentRegistration,
      agentPermissionRules: options.bindings.agentPermissionRules,
    }),
  });

  return {
    id: v2.id,
    server,
    setup: v2.setup,
  };
}
