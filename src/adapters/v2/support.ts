import {
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  type CapabilitySupportMap,
} from "../../contract/capabilities.js";

/**
 * Evidence-backed OpenCode v2.0.3 support classification for the approved
 * semantic capability set.
 *
 * The Promise plugin context exposes no subagent-depth control and no workspace
 * registration domain at this baseline, so both remain explicitly unsupported.
 */
export const OPEN_CODE_V2_CAPABILITY_SUPPORT = Object.freeze({
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
} satisfies CapabilitySupportMap);
