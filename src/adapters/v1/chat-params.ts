import type { ModelRequestIdentity } from "../../contract/model-request.js";
import type { MaybePromise } from "../../contract/lifecycle.js";

/**
 * Narrow structural subset of OpenCode v1.18.30's `chat.params` input used by
 * the approved model-request capabilities.
 */
export interface V1ChatParamsInput {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: {
    readonly id: string;
    readonly providerID: string;
  };
}

export type V1ChatParamsHandler = (
  input: V1ChatParamsInput,
) => MaybePromise<void>;

/**
 * The second native hook argument is deliberately opaque here because these
 * capabilities observe/gate request identity and do not mutate LLM params.
 */
export type V1ChatParamsHook = (
  input: V1ChatParamsInput,
  output: unknown,
) => Promise<void>;

export function toModelRequestIdentity(
  input: V1ChatParamsInput,
): ModelRequestIdentity {
  return {
    sessionID: input.sessionID,
    agent: input.agent,
    providerID: input.model.providerID,
    modelID: input.model.id,
  };
}

/**
 * Compose independent semantic capabilities that share OpenCode v1's single
 * `chat.params` hook without coupling their shared contracts.
 */
export function createV1ChatParamsHook(
  handlers: readonly V1ChatParamsHandler[],
): V1ChatParamsHook {
  return async (input) => {
    for (const handler of handlers) {
      await handler(input);
    }
  };
}
