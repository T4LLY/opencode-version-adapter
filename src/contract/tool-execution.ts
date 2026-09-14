import type { MaybePromise } from "./lifecycle";

/** Minimum shared context required immediately before one host tool executes. */
export interface ToolBeforeExecutionInput {
  readonly sessionID: string;
}

/**
 * Blocking notification delivered at the host's before-tool execution point.
 * Consumers may delay tool execution by awaiting work here.
 */
export type ToolBeforeExecution = (
  input: ToolBeforeExecutionInput,
) => MaybePromise<void>;

/** Minimum shared context required after one host tool completed successfully. */
export interface SuccessfulToolCompletionInput {
  readonly sessionID: string;
  readonly tool: string;
  readonly args: unknown;
}

/** Passive notification for successful host tool completion only. */
export type SuccessfulToolCompletion = (
  input: SuccessfulToolCompletionInput,
) => MaybePromise<void>;
