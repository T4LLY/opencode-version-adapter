import { CAPABILITIES } from "../../../contract/capabilities.js";
import { InvalidHostContextError } from "../../../contract/errors.js";
import type { ModelRequestGate } from "../../../contract/model-request.js";
import type { V2CapabilityAdapter } from "../adapter.js";
import {
  toV2ModelRequestIdentity,
  type V2SessionHookContext,
} from "../session-model.js";

/**
 * Map blocking admission control to OpenCode v2.0.3's awaited
 * `session.hook("model.request")` boundary immediately before provider transport.
 */
export function createV2ModelRequestGateCapability(
  gate: ModelRequestGate,
): V2CapabilityAdapter<V2SessionHookContext> {
  return {
    capability: CAPABILITIES.modelRequestGate,
    async install(context) {
      const session = context.session;
      if (session === undefined || typeof session.hook !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 session.hook is unavailable for model-request gating",
        );
      }

      const registration = await session.hook("model.request", async (event) => {
        await gate(toV2ModelRequestIdentity(event));
      });

      if (registration === undefined || typeof registration.dispose !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 model.request hook did not return a disposable registration",
        );
      }

      return async () => {
        await registration.dispose();
      };
    },
  };
}
