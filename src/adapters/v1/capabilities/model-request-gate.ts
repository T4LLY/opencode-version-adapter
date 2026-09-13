import type { ModelRequestGate } from "../../../contract/model-request";
import {
  toModelRequestIdentity,
  type V1ChatParamsHandler,
} from "../chat-params";

/**
 * Map the shared blocking gate to the awaited OpenCode v1 `chat.params` path.
 */
export function createV1ModelRequestGateHandler(
  gate: ModelRequestGate,
): V1ChatParamsHandler {
  return (input) => gate(toModelRequestIdentity(input));
}
