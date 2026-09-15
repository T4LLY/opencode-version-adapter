import { InvalidHostContextError } from "../../contract/errors.js";
import type { V2AgentInfo, V2AgentListResult } from "./agent-domain.js";

/**
 * Normalize the pinned OpenCode v2.0.3 Promise AgentApi.list() envelope.
 * Upstream returns `{ location, data: AgentInfo[] }`; it does not return the
 * Agent array directly. Keep the unwrap at this boundary so capability logic
 * only handles generation-local Agent records, not Promise client envelopes.
 */
export function unwrapV2AgentListResult(
  result: V2AgentListResult,
): readonly V2AgentInfo[] {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray(result.data)
  ) {
    throw new InvalidHostContextError(
      "OpenCode v2 agent.list() returned an invalid AgentListOutput",
    );
  }
  return result.data;
}
