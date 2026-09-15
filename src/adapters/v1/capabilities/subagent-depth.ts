import type { SubagentDepthRequirement } from "../../../contract/subagent-depth.js";
import { InvalidHostContextError } from "../../../contract/errors.js";
import type { V1ConfigHandler } from "../config.js";

const OPEN_CODE_V1_DEFAULT_SUBAGENT_DEPTH = 1;

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Apply the consumer's required minimum depth through OpenCode v1's global
 * `subagent_depth` config field without reducing a larger host value.
 */
export function createV1SubagentDepthHandler(
  requirement: SubagentDepthRequirement,
): V1ConfigHandler {
  if (!isNonNegativeSafeInteger(requirement.minimumDepth)) {
    throw new TypeError("Subagent minimum depth must be a non-negative safe integer");
  }

  return (config) => {
    const existing = config.subagent_depth;
    if (existing !== undefined && !isNonNegativeSafeInteger(existing)) {
      throw new InvalidHostContextError(
        "OpenCode v1 subagent_depth is not a non-negative safe integer",
      );
    }

    config.subagent_depth = Math.max(
      existing ?? OPEN_CODE_V1_DEFAULT_SUBAGENT_DEPTH,
      requirement.minimumDepth,
    );
  };
}
