import type { MaybePromise } from "./lifecycle";

/** Cancellation context for one host-event delivery invocation. */
export interface HostEventDeliveryContext {
  readonly signal: AbortSignal;
}

/**
 * Deliver one OpenCode host event without assigning application-specific
 * meaning to its payload.
 *
 * The event remains opaque at the shared boundary so consumers can own their
 * own event ontology instead of making it part of this package. Consumers
 * should stop in-flight work promptly when the supplied signal is aborted.
 */
export type HostEventDelivery = (
  event: unknown,
  context: HostEventDeliveryContext,
) => MaybePromise<void>;
