import { CAPABILITIES } from "../../../contract/capabilities.js";
import { InvalidHostContextError } from "../../../contract/errors.js";
import type { ToolBeforeExecution } from "../../../contract/tool-execution.js";
import type { V2CapabilityAdapter } from "../adapter.js";
import type { V2ToolHookContext } from "../tool-execution.js";

/**
 * Map OpenCode v2.0.3's awaited execute.before hook to the minimum shared
 * release-point contract. Native tool/input/agent details remain v2-local.
 */
export function createV2ToolBeforeExecutionCapability(
  beforeToolExecution: ToolBeforeExecution,
): V2CapabilityAdapter<V2ToolHookContext> {
  return {
    capability: CAPABILITIES.toolBeforeExecution,
    async install(context) {
      const tool = context.tool;
      if (tool === undefined || typeof tool.hook !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 tool.hook is unavailable for before-tool execution",
        );
      }

      const registration = await tool.hook("execute.before", async (event) => {
        await beforeToolExecution({ sessionID: event.sessionID });
      });

      if (registration === undefined || typeof registration.dispose !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 execute.before hook did not return a disposable registration",
        );
      }

      return async () => {
        await registration.dispose();
      };
    },
  };
}
