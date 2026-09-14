import { CAPABILITIES } from "../../../contract/capabilities";
import { InvalidHostContextError } from "../../../contract/errors";
import type { SessionAgentModelObserver } from "../../../contract/model-request";
import type { V2CapabilityAdapter } from "../adapter";
import {
  toV2ModelRequestIdentity,
  type V2SessionHookContext,
} from "../session-model";

/**
 * Observe agent-loop identity through OpenCode v2.0.3's `context` hook without
 * acquiring blocking model-request admission semantics.
 */
export function createV2SessionAgentModelObservationCapability(
  observe: SessionAgentModelObserver,
): V2CapabilityAdapter<V2SessionHookContext> {
  return {
    capability: CAPABILITIES.sessionAgentModelObservation,
    async install(context) {
      const session = context.session;
      if (session === undefined || typeof session.hook !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 session.hook is unavailable for session identity observation",
        );
      }

      const registration = await session.hook("context", (event) => {
        observe(toV2ModelRequestIdentity(event));
      });

      if (registration === undefined || typeof registration.dispose !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 context hook did not return a disposable registration",
        );
      }

      return async () => {
        await registration.dispose();
      };
    },
  };
}
