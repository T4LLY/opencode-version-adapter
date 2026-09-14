import type { MaybePromise } from "./lifecycle";

/**
 * Generation-independent Workspace metadata required by the approved
 * demand-runtime consumer. Fields owned by OpenCode remain opaque to the
 * version adapter beyond preserving this stable shape.
 */
export interface WorkspaceInfo {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly branch: string | null;
  readonly directory: string | null;
  readonly extra: unknown | null;
  readonly projectID: string;
}

/** The only target form required by the approved demand-runtime consumer. */
export interface LocalWorkspaceTarget {
  readonly type: "local";
  readonly directory: string;
}

/**
 * Consumer-owned Workspace lifecycle.
 *
 * OpenCode-generation-specific arguments that the approved consumer does not
 * use (for example v1 create-time environment/from values) stay out of the
 * shared contract and are absorbed by the generation adapter.
 */
export interface WorkspaceAdapter {
  readonly name: string;
  readonly description: string;
  configure(info: WorkspaceInfo): MaybePromise<WorkspaceInfo>;
  create(info: WorkspaceInfo): MaybePromise<void>;
  remove(info: WorkspaceInfo): MaybePromise<void>;
  target(info: WorkspaceInfo): MaybePromise<LocalWorkspaceTarget>;
}

/** One exact consumer-owned Workspace type registration. */
export interface WorkspaceRegistration {
  readonly type: string;
  readonly adapter: WorkspaceAdapter;
}
