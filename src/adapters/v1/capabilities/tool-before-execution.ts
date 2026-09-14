import type { ToolBeforeExecution } from "../../../contract/tool-execution";

/** Narrow structural subset of OpenCode v1.18.30's before-tool hook input. */
export interface V1ToolExecuteBeforeInput {
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
}

/** Native mutable hook output; intentionally not promoted to the shared contract. */
export interface V1ToolExecuteBeforeOutput {
  args: unknown;
}

export type V1ToolExecuteBeforeHook = (
  input: V1ToolExecuteBeforeInput,
  output: V1ToolExecuteBeforeOutput,
) => Promise<void>;

/**
 * Map OpenCode v1's awaited before-tool hook to the minimum shared release-point
 * contract. Tool identity and mutable args remain generation-local because the
 * approved FOA consumer requires only the session release point.
 */
export function createV1ToolBeforeExecutionHook(
  beforeToolExecution: ToolBeforeExecution,
): V1ToolExecuteBeforeHook {
  return async (input) => {
    await beforeToolExecution({ sessionID: input.sessionID });
  };
}
