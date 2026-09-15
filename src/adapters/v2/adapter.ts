import {
  CAPABILITIES,
  assertRequiredCapabilitiesSupported,
  normalizeRequiredCapabilities,
  type CapabilityId,
  type CapabilitySupportMap,
  type RequiredCapabilities,
} from "../../contract/capabilities";
import {
  ADAPTER_DIAGNOSTIC_SEVERITY,
  reportDiagnostic,
  type DiagnosticReporter,
} from "../../contract/diagnostics";
import { AdapterInitializationError } from "../../contract/errors";
import {
  createAdapterHandle,
  type AdapterHandle,
  type Cleanup,
  type MaybePromise,
} from "../../contract/lifecycle";

export const OPEN_CODE_V2_GENERATION = "v2" as const;

/**
 * One OpenCode v2 mapping for one shared semantic capability.
 *
 * Detailed Promise-plugin domain translation belongs in capability modules.
 * This composition boundary only selects required mappings and owns cleanup.
 */
export interface V2CapabilityAdapter<Context> {
  readonly capability: CapabilityId;
  install(context: Context): MaybePromise<Cleanup | void>;
}

export interface V2AdapterDefinition<Context> {
  readonly capabilities: CapabilitySupportMap;
  readonly capabilityAdapters: readonly V2CapabilityAdapter<Context>[];
}

export interface V2AdapterSetupInput<Context> {
  readonly context: Context;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly diagnostics?: DiagnosticReporter;
}

export interface V2Adapter<Context> {
  readonly generation: typeof OPEN_CODE_V2_GENERATION;
  readonly capabilities: CapabilitySupportMap;
  setup(input: V2AdapterSetupInput<Context>): Promise<AdapterHandle>;
}

/**
 * Compose OpenCode v2 capability mappings without embedding domain-specific
 * translation in the generation adapter itself.
 */
export function createV2Adapter<Context>(
  definition: V2AdapterDefinition<Context>,
): V2Adapter<Context> {
  const capabilityAdapters = new Map(
    definition.capabilityAdapters.map((adapter) => [adapter.capability, adapter]),
  );

  return {
    generation: OPEN_CODE_V2_GENERATION,
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
          `OpenCode v2 capability mapping is not installed: ${missingCapability}`,
        );
      }

      const cleanups: Cleanup[] = [];
      const setupOrder = orderCapabilities(requiredCapabilities);

      try {
        for (const capability of setupOrder) {
          const adapter = capabilityAdapters.get(capability);
          if (adapter === undefined) {
            throw new Error(
              `OpenCode v2 capability mapping is not installed: ${capability}`,
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

        throw new AdapterInitializationError("OpenCode v2 adapter setup failed", {
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

function orderCapabilities(required: RequiredCapabilities): RequiredCapabilities {
  const permissionIndex = required.indexOf(CAPABILITIES.agentPermissionRules);
  const registrationIndex = required.indexOf(CAPABILITIES.agentRegistration);
  if (
    permissionIndex < 0 ||
    registrationIndex < 0 ||
    registrationIndex < permissionIndex
  ) {
    return required;
  }

  const ordered: CapabilityId[] = [...required];
  ordered.splice(permissionIndex, 1);
  const nextRegistrationIndex = ordered.indexOf(CAPABILITIES.agentRegistration);
  ordered.splice(
    nextRegistrationIndex + 1,
    0,
    CAPABILITIES.agentPermissionRules,
  );
  return ordered;
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
