import type { MaybePromise } from "./lifecycle.js";

export const AGENT_MODES = Object.freeze({
  primary: "primary",
  subagent: "subagent",
  all: "all",
} as const);

export type AgentMode = (typeof AGENT_MODES)[keyof typeof AGENT_MODES];

/** Model selection is atomic across generations: a variant cannot exist without a model. */
export interface AgentModelSelection {
  readonly model: string;
  readonly variant?: string;
}

/**
 * Generation-independent Agent fields required by the approved FOA consumer.
 *
 * Permission rules and global subagent depth are intentionally separate
 * capabilities so registration does not acquire authorization or hierarchy
 * policy.
 */
export interface AgentDefinition {
  readonly model?: AgentModelSelection;
  readonly temperature?: number;
  readonly topP?: number;
  readonly prompt?: string;
  readonly description?: string;
  readonly mode?: AgentMode;
  readonly hidden?: boolean;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly color?: string;
  readonly steps?: number;
}

/** Agent definitions keyed by the exact consumer-owned Agent identifier. */
export type AgentDefinitions = Readonly<Record<string, AgentDefinition>>;

/**
 * Host state exposed only so the consumer can retain ownership of collision
 * decisions without depending on a generation-specific config object.
 */
export interface AgentRegistrationContext {
  readonly existingAgentIDs: readonly string[];
}

/**
 * Produce the Agent definitions to register for the current host state.
 * Throwing/rejecting aborts registration before the adapter mutates the host.
 */
export type AgentRegistration = (
  context: AgentRegistrationContext,
) => MaybePromise<AgentDefinitions>;
