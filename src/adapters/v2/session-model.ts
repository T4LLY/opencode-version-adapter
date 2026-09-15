import type { MaybePromise } from "../../contract/lifecycle.js";
import type { ModelRequestIdentity } from "../../contract/model-request.js";

/** Narrow identity subset shared by the v2 context and model.request hooks. */
export interface V2SessionModelIdentityInput {
  readonly sessionID: string;
  readonly agent: string;
  readonly model: {
    readonly providerID: string;
    readonly id: string;
  };
}

export interface V2SessionHookRegistration {
  dispose(): Promise<void>;
}

export interface V2SessionHooks {
  readonly context: V2SessionModelIdentityInput;
  readonly "model.request": V2SessionModelIdentityInput;
}

/** Narrow structural subset of OpenCode v2.0.3's Promise session hook domain. */
export interface V2SessionHookDomain {
  hook<Name extends keyof V2SessionHooks>(
    name: Name,
    callback: (event: V2SessionHooks[Name]) => MaybePromise<void>,
  ): Promise<V2SessionHookRegistration>;
}

export interface V2SessionHookContext {
  readonly session?: V2SessionHookDomain;
}

export function toV2ModelRequestIdentity(
  input: V2SessionModelIdentityInput,
): ModelRequestIdentity {
  return {
    sessionID: input.sessionID,
    agent: input.agent,
    providerID: input.model.providerID,
    modelID: input.model.id,
  };
}
