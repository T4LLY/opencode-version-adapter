import type { MaybePromise } from "../../contract/lifecycle.js";

/** Narrow structural subset of OpenCode v1's mutable config hook input. */
export interface V1ConfigInput {
  agent?: Record<string, Record<string, unknown> | undefined>;
  subagent_depth?: number;
}

export type V1ConfigHandler = (config: V1ConfigInput) => MaybePromise<void>;
export type V1ConfigHook = (config: V1ConfigInput) => Promise<void>;

function commitKnownConfigFields(
  target: V1ConfigInput,
  draft: V1ConfigInput,
): void {
  if (Object.hasOwn(draft, "agent")) {
    target.agent = draft.agent;
  } else {
    delete target.agent;
  }

  if (Object.hasOwn(draft, "subagent_depth")) {
    target.subagent_depth = draft.subagent_depth;
  } else {
    delete target.subagent_depth;
  }
}

/**
 * Compose semantic capabilities that share OpenCode v1's single `config` hook
 * without coupling their shared contracts.
 *
 * All handlers receive one staged draft. The host config is updated only after
 * every handler succeeds so a later capability failure cannot leave a partial
 * Agent/permission/depth installation behind.
 */
export function createV1ConfigHook(
  handlers: readonly V1ConfigHandler[],
): V1ConfigHook {
  return async (config) => {
    const draft: V1ConfigInput = {
      ...config,
      ...(config.agent === undefined ? {} : { agent: { ...config.agent } }),
    };

    for (const handler of handlers) {
      await handler(draft);
    }

    commitKnownConfigFields(config, draft);
  };
}
