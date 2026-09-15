export interface V2AgentModelRef {
  readonly id: string;
  readonly providerID: string;
  readonly variant?: string;
}

export interface V2AgentPermissionRule {
  readonly action: string;
  readonly resource: string;
  readonly effect: "allow" | "ask" | "deny";
}

export interface V2AgentInfo {
  readonly id: string;
  model?: V2AgentModelRef;
  request: {
    settings: Record<string, unknown>;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  system?: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  hidden: boolean;
  color?: string;
  steps?: number;
  permissions: V2AgentPermissionRule[];
}

export interface V2AgentEditor {
  list(): readonly V2AgentInfo[];
  get(id: string): V2AgentInfo | undefined;
  default(id: string | undefined): void;
  update(id: string, update: (agent: V2AgentInfo) => void): void;
  remove(id: string): void;
}

export interface V2AgentRegistrationHandle {
  dispose(): Promise<void>;
}

export interface V2AgentListLocation {
  readonly directory: string;
  readonly workspaceID?: string;
  readonly project: {
    readonly id: string;
    readonly directory: string;
    readonly canonical: string;
  };
}

/**
 * OpenCode v2.0.3 Promise AgentApi.list() returns AgentListOutput rather than
 * the Agent array directly. Keep this host-facing envelope explicit here so
 * capability code cannot accidentally treat the Promise client response as an
 * array. The pinned upstream shape is `{ location, data: AgentInfo[] }`.
 */
export interface V2AgentListResult {
  readonly location: V2AgentListLocation;
  readonly data: readonly V2AgentInfo[];
}

export interface V2AgentDomain {
  list(): Promise<V2AgentListResult>;
  transform(
    update: (editor: V2AgentEditor) => void,
  ): Promise<V2AgentRegistrationHandle>;
}

export interface V2AgentContext {
  readonly agent?: V2AgentDomain;
}
