import { CAPABILITIES } from "../../src/contract/capabilities";
import type { AdapterDiagnostic } from "../../src/contract/diagnostics";
import { ADAPTER_ERROR_CATEGORY, InvalidHostContextError } from "../../src/contract/errors";
import { createV2HostEventDeliveryCapability } from "../../src/adapters/v2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class ManualEventStream implements AsyncIterable<unknown>, AsyncIterator<unknown> {
  readonly #queue: unknown[] = [];
  readonly #waiters: Array<(result: IteratorResult<unknown>) => void> = [];
  returned = false;

  [Symbol.asyncIterator](): AsyncIterator<unknown> {
    return this;
  }

  next(): Promise<IteratorResult<unknown>> {
    const value = this.#queue.shift();
    if (value !== undefined) {
      return Promise.resolve({ value, done: false });
    }
    if (this.returned) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  return(): Promise<IteratorResult<unknown>> {
    this.returned = true;
    for (const resolve of this.#waiters.splice(0)) {
      resolve({ value: undefined, done: true });
    }
    return Promise.resolve({ value: undefined, done: true });
  }

  push(value: unknown): void {
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter({ value, done: false });
      return;
    }
    this.#queue.push(value);
  }
}

async function deferred(): Promise<{ promise: Promise<void>; resolve: () => void }> {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function assertOpaqueEventDeliveryAndCleanup(): Promise<void> {
  const stream = new ManualEventStream();
  const first = { type: "session.updated", properties: { id: "s1" } };
  const second = { arbitrary: true };
  const received: unknown[] = [];
  const delivered = await deferred();

  const capability = createV2HostEventDeliveryCapability((event) => {
    received.push(event);
    if (received.length === 2) delivered.resolve();
  });

  const cleanup = await capability.install({
    event: {
      subscribe() {
        return stream;
      },
    },
  });

  assert(typeof cleanup === "function", "v2 event mapping must own stream cleanup");
  stream.push(first);
  stream.push(second);
  await delivered.promise;

  assert(received[0] === first && received[1] === second, "v2 event payloads must cross the shared boundary without reinterpretation");

  await cleanup?.();
  assert(stream.returned, "v2 event cleanup must close the acquired iterator when supported");
}

async function assertDeliveryFailureSurfacesImmediatelyAndFromOwnedCleanup(): Promise<void> {
  const stream = new ManualEventStream();
  const failed = await deferred();
  const expected = new Error("consumer delivery failed");
  const diagnostics: AdapterDiagnostic[] = [];
  let deliveries = 0;
  const capability = createV2HostEventDeliveryCapability(() => {
    deliveries += 1;
    failed.resolve();
    throw expected;
  });

  const cleanup = await capability.install(
    { event: { subscribe: () => stream } },
    (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  );
  stream.push({ type: "test" });
  await failed.promise;
  await Promise.resolve();

  assert(
    diagnostics.length === 1 &&
      diagnostics[0]?.severity === "error" &&
      diagnostics[0]?.code === "host-event-delivery-failed" &&
      diagnostics[0]?.capability === CAPABILITIES.hostEventDelivery,
    "v2 background event delivery failure must emit one immediate error diagnostic",
  );

  stream.push({ type: "after-failure" });
  await Promise.resolve();
  assert(
    deliveries === 1,
    "v2 event delivery must remain fail-stop after the first delivery failure",
  );

  let error: unknown;
  try {
    await cleanup?.();
  } catch (caught) {
    error = caught;
  }

  assert(
    error === expected,
    "v2 background event delivery failure must remain owned by cleanup after diagnostic reporting",
  );
}

async function assertDisposeCancelsPendingDeliveryWithoutWaitingForSettlement(): Promise<void> {
  const stream = new ManualEventStream();
  const started = await deferred();
  const diagnostics: AdapterDiagnostic[] = [];
  let deliverySignal: AbortSignal | undefined;

  const capability = createV2HostEventDeliveryCapability((_event, context) => {
    deliverySignal = context.signal;
    started.resolve();
    return new Promise<void>(() => {});
  });

  const cleanup = await capability.install(
    { event: { subscribe: () => stream } },
    (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  );

  stream.push({ type: "pending" });
  await started.promise;

  const disposed = Promise.resolve(cleanup?.()).then(() => "disposed" as const);
  const outcome = await Promise.race([
    disposed,
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), 100);
    }),
  ]);

  assert(
    outcome === "disposed",
    "v2 event cleanup must not wait indefinitely for a pending consumer delivery",
  );
  assert(
    deliverySignal?.aborted === true,
    "v2 event cleanup must abort the in-flight delivery signal before completing",
  );
  assert(
    stream.returned,
    "v2 event cleanup must still close the acquired iterator during cancellation",
  );
  assert(
    diagnostics.length === 0,
    "normal v2 disposal cancellation must not report a delivery failure",
  );
}

async function assertInvalidEventDomainFailsClosed(): Promise<void> {
  const capability = createV2HostEventDeliveryCapability(() => {});
  let error: unknown;
  try {
    await capability.install({});
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof InvalidHostContextError, "missing v2 event domain must use invalid-host-context");
  assert(error.category === ADAPTER_ERROR_CATEGORY.invalidHostContext, "missing v2 event domain must retain the stable error category");
}

(async () => {
  await assertOpaqueEventDeliveryAndCleanup();
  await assertDeliveryFailureSurfacesImmediatelyAndFromOwnedCleanup();
  await assertDisposeCancelsPendingDeliveryWithoutWaitingForSettlement();
  await assertInvalidEventDomainFailsClosed();
})();
