import type { SuccessfulToolCompletion } from "../../../contract/tool-execution.js";

/** Narrow structural subset of OpenCode v1.18.30's after-tool hook input. */
export interface V1ToolExecuteAfterInput {
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
  readonly args: unknown;
}

/**
 * The declared v1 plugin type requires this result shape. The v1.18.30 Task
 * execution path can nevertheless call the hook with `undefined` after it
 * catches a Task failure, so the runtime-facing adapter must accept that case.
 */
export interface V1ToolExecuteAfterOutput {
  readonly title: string;
  readonly output: string;
  readonly metadata: unknown;
}

export type V1ToolExecuteAfterHook = (
  input: V1ToolExecuteAfterInput,
  output: V1ToolExecuteAfterOutput | undefined,
) => Promise<void>;

/**
 * Deliver only genuine successful completions. The undefined Task-failure
 * branch is filtered instead of being reclassified as shared success.
 */
export function createV1SuccessfulToolCompletionHook(
  complete: SuccessfulToolCompletion,
): V1ToolExecuteAfterHook {
  return async (input, output) => {
    if (output === undefined) {
      return;
    }

    await complete({
      sessionID: input.sessionID,
      tool: input.tool,
      args: input.args,
    });
  };
}
