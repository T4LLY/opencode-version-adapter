import { CAPABILITIES } from "../../../contract/capabilities";
import { InvalidHostContextError } from "../../../contract/errors";
import type { SuccessfulToolCompletion } from "../../../contract/tool-execution";
import type { V2CapabilityAdapter } from "../adapter";
import type { V2ToolHookContext } from "../tool-execution";

/**
 * Deliver only OpenCode v2 completed tool events. Native error events and the
 * extra v2 agent/message/call/result fields are intentionally not promoted.
 */
export function createV2SuccessfulToolCompletionCapability(
  complete: SuccessfulToolCompletion,
): V2CapabilityAdapter<V2ToolHookContext> {
  return {
    capability: CAPABILITIES.successfulToolCompletion,
    async install(context) {
      const tool = context.tool;
      if (tool === undefined || typeof tool.hook !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 tool.hook is unavailable for successful tool completion",
        );
      }

      const registration = await tool.hook("execute.after", async (event) => {
        if (event.status !== "completed") {
          return;
        }

        await complete({
          sessionID: event.sessionID,
          tool: event.tool,
          args: event.input,
        });
      });

      if (registration === undefined || typeof registration.dispose !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 execute.after hook did not return a disposable registration",
        );
      }

      return async () => {
        await registration.dispose();
      };
    },
  };
}
