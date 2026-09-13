import type { MaybePromise } from "./lifecycle";

/**
 * Deliver one OpenCode host event without assigning application-specific
 * meaning to its payload.
 *
 * The event remains opaque at the shared boundary so consumers can own their
 * own event ontology instead of making it part of this package.
 */
export type HostEventDelivery = (event: unknown) => MaybePromise<void>;
