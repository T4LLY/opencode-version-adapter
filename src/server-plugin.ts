import type { AgentPermissionRulesProvider } from "./contract/agent-permission.js";
import type { AgentRegistration } from "./contract/agent-registration.js";
import type { RequiredCapabilities } from "./contract/capabilities.js";
import type { DiagnosticReporter } from "./contract/diagnostics.js";
import type { HostEventDelivery } from "./contract/host-event-delivery.js";
import type { Cleanup, MaybePromise } from "./contract/lifecycle.js";
import type {
  ModelRequestGate,
  SessionAgentModelObserver,
} from "./contract/model-request.js";
import type { SubagentDepthRequirement } from "./contract/subagent-depth.js";
import type {
  SuccessfulToolCompletion,
  ToolBeforeExecution,
} from "./contract/tool-execution.js";
import type { WorkspaceRegistration } from "./contract/workspace-registration.js";
import {
  createIntegratedV1ServerPlugin,
  type V1IntegratedContext,
} from "./adapters/v1/integrated-adapter.js";
import { createIntegratedV2Adapter } from "./adapters/v2/integrated-adapter.js";
import { createV2ServerDefinition } from "./adapters/v2/capabilities/server-lifecycle.js";
import type { V2IntegratedContext } from "./adapters/v2/integrated-adapter.js";

/**
 * Generation-independent semantic bindings accepted by the candidate server
 * entrypoint. A binding is activated only when its capability is required.
 */
export interface OpenCodeServerBindings {
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

export interface OpenCodeServerBindingsContext {
  readonly options: unknown;
}

export type OpenCodeServerBindingsFactory = (
  context: OpenCodeServerBindingsContext,
) => OpenCodeServerBindings;

interface OpenCodeServerPluginBaseOptions {
  readonly id: string;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly diagnostics?: DiagnosticReporter;
}

export type OpenCodeServerPluginOptions = OpenCodeServerPluginBaseOptions &
  (
    | {
        readonly bindings: OpenCodeServerBindings;
        readonly createBindings?: never;
      }
    | {
        readonly bindings?: never;
        readonly createBindings: OpenCodeServerBindingsFactory;
      }
  );

/**
 * One module shape intentionally readable by both pinned OpenCode loaders.
 *
 * OpenCode v1.18.30 selects `server()` and ignores `setup`. OpenCode v2.0.3
 * decodes `id` + `setup()` and ignores the extra `server` member. Consumers
 * default-export this value and do not select a generation themselves.
 */
export interface OpenCodeServerPluginModule {
  readonly id: string;
  readonly server: (context: unknown, options?: unknown) => Promise<unknown>;
  readonly setup: (context: unknown) => MaybePromise<Cleanup | void>;
}

export function createOpenCodeServerPlugin(
  options: OpenCodeServerPluginOptions,
): OpenCodeServerPluginModule {
  return {
    id: options.id,
    async server(context: unknown, hostOptions?: unknown) {
      const bindings = resolveBindings(options, hostOptions);
      const server = createIntegratedV1ServerPlugin({
        requiredCapabilities: options.requiredCapabilities,
        bindings,
        diagnostics: options.diagnostics,
      });
      return server(context as V1IntegratedContext);
    },
    async setup(context: unknown) {
      const bindings = resolveBindings(options, readV2HostOptions(context));
      const v2 = createV2ServerDefinition<V2IntegratedContext>({
        id: options.id,
        requiredCapabilities: options.requiredCapabilities,
        diagnostics: options.diagnostics,
        adapter: createIntegratedV2Adapter({
          lifecycleCleanup: bindings.lifecycleCleanup,
          hostEventDelivery: bindings.hostEventDelivery,
          modelRequestGate: bindings.modelRequestGate,
          sessionAgentModelObservation: bindings.sessionAgentModelObservation,
          toolBeforeExecution: bindings.toolBeforeExecution,
          successfulToolCompletion: bindings.successfulToolCompletion,
          agentRegistration: bindings.agentRegistration,
          agentPermissionRules: bindings.agentPermissionRules,
        }),
      });
      return v2.setup(context as V2IntegratedContext);
    },
  };
}

function resolveBindings(
  options: OpenCodeServerPluginOptions,
  hostOptions: unknown,
): OpenCodeServerBindings {
  if (options.createBindings !== undefined) {
    return options.createBindings({ options: hostOptions });
  }
  return options.bindings;
}

function readV2HostOptions(context: unknown): unknown {
  if (context === null || typeof context !== "object") {
    return undefined;
  }
  return Reflect.get(context, "options");
}
