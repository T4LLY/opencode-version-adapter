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

export interface V2AgentDomain {
  list(): Promise<readonly V2AgentInfo[]>;
  transform(
    update: (editor: V2AgentEditor) => void,
  ): Promise<V2AgentRegistrationHandle>;
}

export interface V2AgentContext {
  readonly agent?: V2AgentDomain;
}
