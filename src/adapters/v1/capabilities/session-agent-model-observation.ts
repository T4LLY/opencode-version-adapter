import type { SessionAgentModelObserver } from "../../../contract/model-request";
import {
  toModelRequestIdentity,
  type V1ChatParamsHandler,
} from "../chat-params";

/**
 * Map passive session/agent/model observation onto OpenCode v1 `chat.params`
 * without giving the observer ownership of model-request admission control.
 */
export function createV1SessionAgentModelObservationHandler(
  observe: SessionAgentModelObserver,
): V1ChatParamsHandler {
  return (input) => {
    observe(toModelRequestIdentity(input));
  };
}
