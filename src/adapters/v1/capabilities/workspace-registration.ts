import { CAPABILITIES } from "../../../contract/capabilities.js";
import { InvalidHostContextError } from "../../../contract/errors.js";
import type { MaybePromise } from "../../../contract/lifecycle.js";
import type {
  LocalWorkspaceTarget,
  WorkspaceAdapter,
  WorkspaceInfo,
  WorkspaceRegistration,
} from "../../../contract/workspace-registration.js";
import type { V1CapabilityAdapter } from "../adapter.js";

/** Narrow OpenCode v1 Workspace adapter surface used by registration. */
export interface V1WorkspaceAdapter {
  readonly name: string;
  readonly description: string;
  configure(info: WorkspaceInfo): MaybePromise<WorkspaceInfo>;
  create(
    info: WorkspaceInfo,
    env: Record<string, string | undefined>,
    from?: WorkspaceInfo,
  ): Promise<void>;
  remove(info: WorkspaceInfo): Promise<void>;
  target(info: WorkspaceInfo): MaybePromise<LocalWorkspaceTarget>;
}

/** Narrow structural subset of v1 PluginInput.experimental_workspace. */
export interface V1WorkspaceRegistry {
  register(type: string, adapter: V1WorkspaceAdapter): void;
}

export interface V1WorkspaceRegistrationContext {
  readonly experimental_workspace?: V1WorkspaceRegistry;
}

/**
 * Wrap a consumer-owned Workspace adapter in OpenCode v1's native shape.
 *
 * The approved demand-runtime consumer does not use v1's create-time `env` or
 * `from` arguments, so they are intentionally not promoted into the shared
 * contract.
 */
export function toV1WorkspaceAdapter(
  adapter: WorkspaceAdapter,
): V1WorkspaceAdapter {
  return {
    name: adapter.name,
    description: adapter.description,
    configure(info) {
      return adapter.configure(info);
    },
    async create(info) {
      await adapter.create(info);
    },
    async remove(info) {
      await adapter.remove(info);
    },
    target(info) {
      return adapter.target(info);
    },
  };
}

/**
 * Register one consumer-owned Workspace adapter through OpenCode v1.
 *
 * v1.18.30 exposes no unregister operation for this project-scoped registry,
 * so successful registration returns no fabricated cleanup action. The v1
 * generation adapter commits this capability after all rollback-capable setup.
 */
export function createV1WorkspaceRegistrationCapability(
  registration: WorkspaceRegistration,
): V1CapabilityAdapter<V1WorkspaceRegistrationContext> {
  if (typeof registration.type !== "string" || registration.type.trim() === "") {
    throw new TypeError("Workspace registration type must be a non-empty string");
  }

  return {
    capability: CAPABILITIES.workspaceRegistration,
    install(context) {
      const registry = context.experimental_workspace;
      if (registry === undefined || typeof registry.register !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v1 experimental_workspace.register is unavailable",
        );
      }

      registry.register(registration.type, toV1WorkspaceAdapter(registration.adapter));
    },
  };
}
