import type { AdapterHandle } from "../../../contract/lifecycle.js";

/** OpenCode v1 `Hooks.dispose` shape used by the server plugin loader. */
export type V1DisposeHook = () => Promise<void>;

/**
 * Map the generation-level cleanup owner to OpenCode v1's dispose hook.
 * Idempotency remains owned by AdapterHandle.
 */
export function createV1DisposeHook(handle: AdapterHandle): V1DisposeHook {
  return async () => {
    await handle.dispose();
  };
}
