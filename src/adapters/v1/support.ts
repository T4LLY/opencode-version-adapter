import {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  type CapabilitySupportMap,
} from "../../contract/capabilities.js";

/**
 * Evidence-backed OpenCode v1.18.30 support classification for the approved
 * Phase 0 semantic capability set.
 */
export const OPEN_CODE_V1_CAPABILITY_SUPPORT = Object.freeze({
  [CAPABILITIES.serverLifecycle]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.hostEventDelivery]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.modelRequestGate]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.sessionAgentModelObservation]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.toolBeforeExecution]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.successfulToolCompletion]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.agentRegistration]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.agentPermissionRules]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.subagentDepth]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.native,
} satisfies CapabilitySupportMap);
