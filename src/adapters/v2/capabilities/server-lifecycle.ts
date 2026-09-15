import { CAPABILITIES, type RequiredCapabilities } from "../../../contract/capabilities";
import type { DiagnosticReporter } from "../../../contract/diagnostics";
import type { Cleanup, MaybePromise } from "../../../contract/lifecycle";
import type { V2Adapter, V2CapabilityAdapter } from "../adapter";

/** Narrow OpenCode v2 server definition shape required by the external loader. */
export interface V2ServerDefinition<Context> {
  readonly id: string;
  setup(context: Context): MaybePromise<Cleanup | void>;
}

/**
 * Marker mapping for the shared lifecycle capability.
 *
 * The actual v2 lifecycle translation occurs at the server definition boundary
 * below, where one adapter setup handle becomes the cleanup returned to the
 * OpenCode v2 loader.
 */
export function createV2ServerLifecycleCapability<Context>(): V2CapabilityAdapter<Context> {
  return {
    capability: CAPABILITIES.serverLifecycle,
    install() {},
  };
}

/**
 * Map the generation-independent setup/dispose owner to OpenCode v2's
 * `{ id, setup }` server definition. OpenCode owns invoking the returned cleanup.
 */
export function createV2ServerDefinition<Context>(input: {
  readonly id: string;
  readonly adapter: V2Adapter<Context>;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly diagnostics?: DiagnosticReporter;
}): V2ServerDefinition<Context> {
  if (typeof input.id !== "string" || input.id.trim() === "") {
    throw new TypeError("OpenCode v2 plugin id must be a non-empty string");
  }

  return {
    id: input.id,
    async setup(context) {
      const handle = await input.adapter.setup({
        context,
        requiredCapabilities: input.requiredCapabilities,
        diagnostics: input.diagnostics,
      });

      return async () => {
        await handle.dispose();
      };
    },
  };
}
