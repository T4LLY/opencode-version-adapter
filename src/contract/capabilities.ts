import { UnsupportedCapabilityError } from "./errors.js";

/**
 * Shared semantic capabilities proven by the Phase 0 consumer/runtime survey.
 *
 * These identifiers describe consumer-visible behavior, not OpenCode hook names.
 * TUI and best-effort client logging are intentionally absent from this surface.
 */
export const CAPABILITIES = Object.freeze({
  serverLifecycle: "server-lifecycle",
  hostEventDelivery: "host-event-delivery",
  modelRequestGate: "model-request-gate",
  sessionAgentModelObservation: "session-agent-model-observation",
  toolBeforeExecution: "tool-before-execution",
  successfulToolCompletion: "successful-tool-completion",
  agentRegistration: "agent-registration",
  agentPermissionRules: "agent-permission-rules",
  subagentDepth: "subagent-depth",
  workspaceRegistration: "workspace-registration",
} as const);

export type CapabilityId = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const CAPABILITY_SUPPORT = Object.freeze({
  native: "native",
  emulated: "emulated",
  unsupported: "unsupported",
} as const);

export type CapabilitySupport =
  (typeof CAPABILITY_SUPPORT)[keyof typeof CAPABILITY_SUPPORT];

/**
 * A generation must classify every capability represented by the shared contract.
 * Absence is not treated as an implicit unsupported state.
 */
export type CapabilitySupportMap = Readonly<
  Record<CapabilityId, CapabilitySupport>
>;

/** Capabilities whose absence prevents the consumer from activating safely. */
export type RequiredCapabilities = readonly CapabilityId[];

/**
 * Normalize capability requirements to their set semantics while preserving
 * the first occurrence order used by generation-specific setup ordering.
 */
export function normalizeRequiredCapabilities(
  required: RequiredCapabilities,
): {
  readonly requiredCapabilities: RequiredCapabilities;
  readonly duplicateCapabilities: readonly CapabilityId[];
} {
  const seen = new Set<CapabilityId>();
  const duplicateSet = new Set<CapabilityId>();
  const requiredCapabilities: CapabilityId[] = [];
  const duplicateCapabilities: CapabilityId[] = [];

  for (const capability of required) {
    if (!seen.has(capability)) {
      seen.add(capability);
      requiredCapabilities.push(capability);
      continue;
    }

    if (!duplicateSet.has(capability)) {
      duplicateSet.add(capability);
      duplicateCapabilities.push(capability);
    }
  }

  return { requiredCapabilities, duplicateCapabilities };
}

export function assertRequiredCapabilitiesSupported(
  required: RequiredCapabilities,
  support: CapabilitySupportMap,
): void {
  for (const capability of required) {
    if (support[capability] === CAPABILITY_SUPPORT.unsupported) {
      throw new UnsupportedCapabilityError(capability);
    }
  }
}
