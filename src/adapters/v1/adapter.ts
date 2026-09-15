import {
  CAPABILITIES,
  assertRequiredCapabilitiesSupported,
  normalizeRequiredCapabilities,
  type CapabilityId,
  type CapabilitySupportMap,
  type RequiredCapabilities,
} from "../../contract/capabilities.js";
import {
  ADAPTER_DIAGNOSTIC_SEVERITY,
  reportDiagnostic,
  type DiagnosticReporter,
} from "../../contract/diagnostics.js";
import { AdapterInitializationError } from "../../contract/errors.js";
import {
  createAdapterHandle,
  type AdapterHandle,
  type Cleanup,
  type MaybePromise,
} from "../../contract/lifecycle.js";

export const OPEN_CODE_V1_GENERATION = "v1" as const;

/**
 * One OpenCode v1 mapping for one shared semantic capability.
 *
 * Detailed hook translation belongs in capability modules. This composition
 * boundary only decides which mappings participate in one setup attempt and
 * owns the resulting cleanup order.
 */
export interface V1CapabilityAdapter<Context> {
  readonly capability: CapabilityId;
  install(context: Context): MaybePromise<Cleanup | void>;
}

export interface V1AdapterDefinition<Context> {
  readonly capabilities: CapabilitySupportMap;
  readonly capabilityAdapters: readonly V1CapabilityAdapter<Context>[];
}

export interface V1AdapterSetupInput<Context> {
  readonly context: Context;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly diagnostics?: DiagnosticReporter;
}

export interface V1Adapter<Context> {
  readonly generation: typeof OPEN_CODE_V1_GENERATION;
  readonly capabilities: CapabilitySupportMap;
  setup(input: V1AdapterSetupInput<Context>): Promise<AdapterHandle>;
}

/**
 * Compose OpenCode v1 capability mappings without embedding mapping details in
 * the generation adapter itself.
 */
export function createV1Adapter<Context>(
  definition: V1AdapterDefinition<Context>,
): V1Adapter<Context> {
  const capabilityAdapters = new Map(
    definition.capabilityAdapters.map((adapter) => [adapter.capability, adapter]),
  );

  return {
    generation: OPEN_CODE_V1_GENERATION,
    capabilities: definition.capabilities,

    async setup(input): Promise<AdapterHandle> {
      const { requiredCapabilities, duplicateCapabilities } =
        normalizeRequiredCapabilities(input.requiredCapabilities);

      for (const capability of duplicateCapabilities) {
        await reportDiagnostic(input.diagnostics, {
          severity: ADAPTER_DIAGNOSTIC_SEVERITY.warning,
          code: "duplicate-required-capability",
          message: `Duplicate required capability ignored: ${capability}`,
          capability,
        });
      }

      assertRequiredCapabilitiesSupported(
        requiredCapabilities,
        definition.capabilities,
      );

      const missingCapability = requiredCapabilities.find(
        (capability) => !capabilityAdapters.has(capability),
      );
      if (missingCapability !== undefined) {
        throw new AdapterInitializationError(
          `OpenCode v1 capability mapping is not installed: ${missingCapability}`,
        );
      }

      const cleanups: Cleanup[] = [];
      const setupOrder = [
        ...requiredCapabilities.filter(
          (capability) => capability !== CAPABILITIES.workspaceRegistration,
        ),
        ...requiredCapabilities.filter(
          (capability) => capability === CAPABILITIES.workspaceRegistration,
        ),
      ];

      try {
        for (const capability of setupOrder) {
          const adapter = capabilityAdapters.get(capability);
          if (adapter === undefined) {
            throw new Error(
              `OpenCode v1 capability mapping is not installed: ${capability}`,
            );
          }

          const cleanup = await adapter.install(input.context);
          if (cleanup !== undefined) {
            cleanups.push(cleanup);
          }
        }
      } catch (error) {
        const rollbackError = await disposeOwnedCleanups(cleanups);
        const cause =
          rollbackError === undefined
            ? error
            : { setupError: error, rollbackError };

        throw new AdapterInitializationError("OpenCode v1 adapter setup failed", {
          cause,
        });
      }

      return createAdapterHandle(async () => {
        const cleanupError = await disposeOwnedCleanups(cleanups);
        if (cleanupError !== undefined) {
          throw cleanupError;
        }
      });
    },
  };
}

async function disposeOwnedCleanups(cleanups: Cleanup[]): Promise<unknown> {
  let firstError: unknown;

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup === undefined) {
      continue;
    }

    try {
      await cleanup();
    } catch (error) {
      firstError ??= error;
    }
  }

  return firstError;
}
