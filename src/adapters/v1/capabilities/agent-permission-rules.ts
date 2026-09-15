import type {
  AgentPermissionAction,
  AgentPermissionRuleGroup,
  AgentPermissionRules,
  AgentPermissionRulesProvider,
} from "../../../contract/agent-permission.js";
import { InvalidHostContextError } from "../../../contract/errors.js";
import type { V1ConfigHandler } from "../config.js";

export type V1PermissionPatternMap = Record<string, AgentPermissionAction>;
export type V1AgentPermissionConfig = Record<
  string,
  AgentPermissionAction | V1PermissionPatternMap
>;

function moveToEnd<T>(target: Record<string, T>, key: string, value: T): void {
  if (Object.hasOwn(target, key)) {
    delete target[key];
  }
  target[key] = value;
}

function toV1PermissionGroup(
  group: AgentPermissionRuleGroup,
): AgentPermissionAction | V1PermissionPatternMap {
  if (group.rules.length === 1 && group.rules[0]?.pattern === "*") {
    return group.rules[0].action;
  }

  const patterns: V1PermissionPatternMap = {};

  for (const rule of group.rules) {
    // OpenCode v1 consumes Object.entries() in insertion order and evaluates
    // with findLast(). Re-inserting a repeated pattern preserves the semantic
    // position of its final occurrence rather than its first occurrence.
    moveToEnd<AgentPermissionAction>(patterns, rule.pattern, rule.action);
  }

  return patterns;
}

/**
 * Map generation-independent ordered permission intent to OpenCode v1 config.
 *
 * OpenCode v1.18.30 converts config with Object.entries() and then resolves the
 * last matching runtime rule. Keeping group/rule insertion order therefore
 * preserves the consumer-visible precedence contract.
 */
export function toV1AgentPermissionConfig(
  rules: AgentPermissionRules,
): V1AgentPermissionConfig {
  const mapped: V1AgentPermissionConfig = {};

  for (const group of rules) {
    if (Object.hasOwn(mapped, group.permission)) {
      throw new TypeError(
        `Agent permission namespace appears more than once: ${group.permission}`,
      );
    }

    mapped[group.permission] = toV1PermissionGroup(group);
  }

  return mapped;
}

/**
 * Apply permission intent only to Agents that already exist in the v1 config
 * plan. This keeps Agent creation in the separate registration capability.
 */
export function createV1AgentPermissionRulesHandler(
  provideRules: AgentPermissionRulesProvider,
): V1ConfigHandler {
  return async (config) => {
    const planned = await provideRules();
    const currentAgents = config.agent ?? {};
    const nextAgents: Record<string, Record<string, unknown> | undefined> = {
      ...currentAgents,
    };

    for (const [agentID, rules] of Object.entries(planned)) {
      const current = currentAgents[agentID];
      if (current === undefined) {
        throw new InvalidHostContextError(
          `OpenCode v1 permission target Agent is not registered: ${agentID}`,
        );
      }

      nextAgents[agentID] = {
        ...current,
        permission: toV1AgentPermissionConfig(rules),
      };
    }

    config.agent = nextAgents;
  };
}
