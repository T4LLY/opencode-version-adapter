import type { MaybePromise } from "./lifecycle.js";

export const AGENT_PERMISSION_ACTIONS = Object.freeze({
  allow: "allow",
  ask: "ask",
  deny: "deny",
} as const);

export type AgentPermissionAction =
  (typeof AGENT_PERMISSION_ACTIONS)[keyof typeof AGENT_PERMISSION_ACTIONS];

/** One ordered pattern/action decision inside a permission namespace. */
export interface AgentPermissionPatternRule {
  readonly pattern: string;
  readonly action: AgentPermissionAction;
}

/**
 * One permission namespace and its ordered pattern rules.
 *
 * One AgentPermissionRules value contains at most one group for a given
 * permission namespace. Keeping namespaces grouped mirrors the consumer-owned
 * OpenCode v1 shape without exposing a generation-specific object. Rule order
 * remains semantic because later matching patterns override earlier matches.
 */
export interface AgentPermissionRuleGroup {
  readonly permission: string;
  readonly rules: readonly AgentPermissionPatternRule[];
}

/** Ordered permission intent for one Agent. */
export type AgentPermissionRules = readonly AgentPermissionRuleGroup[];

/** Ordered permission intent keyed by the exact consumer-owned Agent ID. */
export type AgentPermissionRulesByAgent = Readonly<
  Record<string, AgentPermissionRules>
>;

/**
 * Produce the complete permission intent to apply to Agents already present in
 * the host registration plan. Agent creation remains owned by agent-registration.
 */
export type AgentPermissionRulesProvider = () =>
  MaybePromise<AgentPermissionRulesByAgent>;
