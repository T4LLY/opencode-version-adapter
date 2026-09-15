import type { MaybePromise } from "../../contract/lifecycle.js";

export interface V2ToolExecuteBeforeEvent {
  readonly tool: string;
  readonly sessionID: string;
  readonly agent: string;
  readonly messageID: string;
  readonly id: string;
  readonly input: unknown;
}

interface V2ToolExecuteAfterBaseEvent {
  readonly tool: string;
  readonly sessionID: string;
  readonly agent: string;
  readonly messageID: string;
  readonly id: string;
  readonly input: unknown;
}

export type V2ToolExecuteAfterEvent =
  | (V2ToolExecuteAfterBaseEvent & {
      readonly status: "completed";
      readonly result: unknown;
    })
  | (V2ToolExecuteAfterBaseEvent & {
      readonly status: "error";
      readonly error: unknown;
    });

export interface V2ToolHookRegistration {
  dispose(): Promise<void>;
}

export interface V2ToolHooks {
  readonly "execute.before": V2ToolExecuteBeforeEvent;
  readonly "execute.after": V2ToolExecuteAfterEvent;
}

/** Narrow structural subset of OpenCode v2.0.3's Promise tool-hook domain. */
export interface V2ToolHookDomain {
  hook<Name extends keyof V2ToolHooks>(
    name: Name,
    callback: (event: V2ToolHooks[Name]) => MaybePromise<void>,
  ): Promise<V2ToolHookRegistration>;
}

export interface V2ToolHookContext {
  readonly tool?: V2ToolHookDomain;
}
