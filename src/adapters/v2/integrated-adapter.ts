import type { AgentPermissionRulesProvider } from "../../contract/agent-permission.js";
import type { AgentRegistration } from "../../contract/agent-registration.js";
import type { HostEventDelivery } from "../../contract/host-event-delivery.js";
import type { Cleanup } from "../../contract/lifecycle.js";
import type {
  ModelRequestGate,
  SessionAgentModelObserver,
} from "../../contract/model-request.js";
import type {
  SuccessfulToolCompletion,
  ToolBeforeExecution,
} from "../../contract/tool-execution.js";
import {
  createV2Adapter,
  type V2Adapter,
  type V2CapabilityAdapter,
} from "./adapter.js";
import type { V2AgentContext } from "./agent-domain.js";
import { createV2AgentPermissionRulesCapability } from "./capabilities/agent-permission-rules.js";
import { createV2AgentRegistrationCapability } from "./capabilities/agent-registration.js";
import {
  createV2HostEventDeliveryCapability,
  type V2HostEventContext,
} from "./capabilities/host-event-delivery.js";
import { createV2ModelRequestGateCapability } from "./capabilities/model-request-gate.js";
import { createV2ServerLifecycleCapability } from "./capabilities/server-lifecycle.js";
import { createV2SessionAgentModelObservationCapability } from "./capabilities/session-agent-model-observation.js";
import { createV2SuccessfulToolCompletionCapability } from "./capabilities/successful-tool-completion.js";
import { createV2ToolBeforeExecutionCapability } from "./capabilities/tool-before-execution.js";
import type { V2SessionHookContext } from "./session-model.js";
import { OPEN_CODE_V2_CAPABILITY_SUPPORT } from "./support.js";
import type { V2ToolHookContext } from "./tool-execution.js";

/**
 * Narrow structural host context required by the approved OpenCode v2 mappings.
 * No consumer policy or full Promise-plugin Context type crosses this boundary.
 */
export interface V2IntegratedContext
  extends V2HostEventContext,
    V2SessionHookContext,
    V2ToolHookContext,
    V2AgentContext {}

/**
 * Consumer-owned semantic handlers for the supported v2 capabilities.
 *
 * Bindings are optional because one consumer normally requires only a subset of
 * the shared capability inventory. A required capability without its matching
 * binding still fails during adapter setup rather than becoming a no-op.
 */
export interface V2CapabilityBindings {
  readonly lifecycleCleanup?: Cleanup;
  readonly hostEventDelivery?: HostEventDelivery;
  readonly modelRequestGate?: ModelRequestGate;
  readonly sessionAgentModelObservation?: SessionAgentModelObserver;
  readonly toolBeforeExecution?: ToolBeforeExecution;
  readonly successfulToolCompletion?: SuccessfulToolCompletion;
  readonly agentRegistration?: AgentRegistration;
  readonly agentPermissionRules?: AgentPermissionRulesProvider;
}

/**
 * Assemble the complete evidence-backed OpenCode v2 adapter from shared
 * semantic bindings. Detailed translation remains in the individual capability
 * modules; this factory only wires those modules into the generation boundary.
 */
export function createIntegratedV2Adapter(
  bindings: V2CapabilityBindings,
): V2Adapter<V2IntegratedContext> {
  const capabilityAdapters: V2CapabilityAdapter<V2IntegratedContext>[] = [
    createV2ServerLifecycleCapability<V2IntegratedContext>(bindings.lifecycleCleanup),
  ];

  if (bindings.hostEventDelivery !== undefined) {
    capabilityAdapters.push(
      createV2HostEventDeliveryCapability(bindings.hostEventDelivery),
    );
  }
  if (bindings.modelRequestGate !== undefined) {
    capabilityAdapters.push(
      createV2ModelRequestGateCapability(bindings.modelRequestGate),
    );
  }
  if (bindings.sessionAgentModelObservation !== undefined) {
    capabilityAdapters.push(
      createV2SessionAgentModelObservationCapability(
        bindings.sessionAgentModelObservation,
      ),
    );
  }
  if (bindings.toolBeforeExecution !== undefined) {
    capabilityAdapters.push(
      createV2ToolBeforeExecutionCapability(bindings.toolBeforeExecution),
    );
  }
  if (bindings.successfulToolCompletion !== undefined) {
    capabilityAdapters.push(
      createV2SuccessfulToolCompletionCapability(
        bindings.successfulToolCompletion,
      ),
    );
  }
  if (bindings.agentRegistration !== undefined) {
    capabilityAdapters.push(
      createV2AgentRegistrationCapability(bindings.agentRegistration),
    );
  }
  if (bindings.agentPermissionRules !== undefined) {
    capabilityAdapters.push(
      createV2AgentPermissionRulesCapability(bindings.agentPermissionRules),
    );
  }

  return createV2Adapter({
    capabilities: OPEN_CODE_V2_CAPABILITY_SUPPORT,
    capabilityAdapters,
  });
}
