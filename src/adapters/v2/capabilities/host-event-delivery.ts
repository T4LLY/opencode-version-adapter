import { CAPABILITIES } from "../../../contract/capabilities";
import { InvalidHostContextError } from "../../../contract/errors";
import type { HostEventDelivery } from "../../../contract/host-event-delivery";
import type { V2CapabilityAdapter } from "../adapter";

/** Narrow structural subset of OpenCode v2's event subscription domain. */
export interface V2EventDomain {
  subscribe(): AsyncIterable<unknown>;
}

export interface V2HostEventContext {
  readonly event?: V2EventDomain;
}

/**
 * Map OpenCode v2's async event stream to the shared opaque event callback.
 * Event interpretation remains consumer-owned.
 */
export function createV2HostEventDeliveryCapability(
  deliver: HostEventDelivery,
): V2CapabilityAdapter<V2HostEventContext> {
  return {
    capability: CAPABILITIES.hostEventDelivery,
    install(context) {
      const event = context.event;
      if (event === undefined || typeof event.subscribe !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 event.subscribe is unavailable",
        );
      }

      const stream = event.subscribe();
      const iteratorFactory = stream?.[Symbol.asyncIterator];
      if (typeof iteratorFactory !== "function") {
        throw new InvalidHostContextError(
          "OpenCode v2 event.subscribe did not return an async iterable",
        );
      }

      const iterator = iteratorFactory.call(stream);
      let stopping = false;
      let deliveryError: unknown;

      const pump = (async () => {
        try {
          while (!stopping) {
            const next = await iterator.next();
            if (next.done) {
              return;
            }
            await deliver(next.value);
          }
        } catch (error) {
          if (!stopping) {
            deliveryError = error;
          }
        }
      })();

      return async () => {
        stopping = true;
        let returnError: unknown;

        if (typeof iterator.return === "function") {
          try {
            await iterator.return();
          } catch (error) {
            returnError = error;
          }
        }

        await pump;

        if (deliveryError !== undefined) {
          throw deliveryError;
        }
        if (returnError !== undefined) {
          throw returnError;
        }
      };
    },
  };
}
