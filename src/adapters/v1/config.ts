import type { MaybePromise } from "../../contract/lifecycle";

/** Narrow structural subset of OpenCode v1's mutable config hook input. */
export interface V1ConfigInput {
  agent?: Record<string, Record<string, unknown> | undefined>;
}

export type V1ConfigHandler = (config: V1ConfigInput) => MaybePromise<void>;
export type V1ConfigHook = (config: V1ConfigInput) => Promise<void>;

/**
 * Compose semantic capabilities that share OpenCode v1's single `config` hook
 * without coupling their shared contracts.
 */
export function createV1ConfigHook(
  handlers: readonly V1ConfigHandler[],
): V1ConfigHook {
  return async (config) => {
    for (const handler of handlers) {
      await handler(config);
    }
  };
}
