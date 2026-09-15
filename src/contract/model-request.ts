import type { MaybePromise } from "./lifecycle.js";

/**
 * Generation-independent identity available at model-request time.
 *
 * Only stable identifiers required by the approved consumers are exposed;
 * generation-specific model/provider objects remain inside the adapter.
 */
export interface ModelRequestIdentity {
  readonly sessionID: string;
  readonly agent: string;
  readonly providerID: string;
  readonly modelID: string;
}

/** Admission control that must complete before the model request may continue. */
export type ModelRequestGate = (
  identity: ModelRequestIdentity,
) => MaybePromise<void>;

/** Passive session-to-agent/model observation without gate ownership. */
export type SessionAgentModelObserver = (identity: ModelRequestIdentity) => void;
