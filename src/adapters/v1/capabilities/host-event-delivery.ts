import type { HostEventDelivery } from "../../../contract/host-event-delivery";

const HOST_OWNED_EVENT_SIGNAL = new AbortController().signal;

/** Narrow structural shape of the OpenCode v1 `event` hook input. */
export interface V1EventHookInput {
  readonly event: unknown;
}

/** OpenCode v1 `Hooks.event` shape required by this capability. */
export type V1EventHook = (input: V1EventHookInput) => Promise<void>;

/**
 * Map OpenCode v1's `{ event }` hook envelope to the shared opaque event
 * delivery callback. Event interpretation remains consumer-owned.
 */
export function createV1HostEventHook(
  deliver: HostEventDelivery,
): V1EventHook {
  return async ({ event }) => {
    await deliver(event, { signal: HOST_OWNED_EVENT_SIGNAL });
  };
}
