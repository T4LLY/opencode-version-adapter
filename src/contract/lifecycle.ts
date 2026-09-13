/** A value that may be produced synchronously or asynchronously. */
export type MaybePromise<T> = T | Promise<T>;

/** Cleanup action owned by a capability or generation adapter. */
export type Cleanup = () => MaybePromise<void>;

/**
 * The single lifecycle owner returned by a successful generation setup.
 *
 * Consumers dispose the adapter through this handle instead of depending on
 * generation-specific teardown behavior.
 */
export interface AdapterHandle {
  dispose(): MaybePromise<void>;
}

/**
 * Wrap one generation-level cleanup action in an idempotent owner.
 *
 * Composition of multiple capability cleanups intentionally remains the
 * generation adapter's responsibility until coordinated cleanup is actually
 * required by more than one capability.
 */
export function createAdapterHandle(cleanup: Cleanup): AdapterHandle {
  let started = false;
  let pending: Promise<void> | undefined;

  return {
    dispose(): MaybePromise<void> {
      if (started) {
        return pending;
      }

      started = true;
      const result = cleanup();
      if (result !== undefined) {
        pending = result;
      }

      return pending;
    },
  };
}
