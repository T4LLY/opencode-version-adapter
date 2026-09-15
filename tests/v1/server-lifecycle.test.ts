import { createV1DisposeHook } from "../../src/adapters/v1/capabilities/server-lifecycle.js";
import { createAdapterHandle } from "../../src/contract/lifecycle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertDisposeUsesGenerationOwner(): Promise<void> {
  let cleanupCount = 0;
  const handle = createAdapterHandle(async () => {
    cleanupCount += 1;
  });
  const dispose = createV1DisposeHook(handle);

  await dispose();
  await dispose();

  assert(
    cleanupCount === 1,
    "v1 dispose hook must use the idempotent generation cleanup owner",
  );
}

async function assertDisposeAwaitsCleanup(): Promise<void> {
  let release: (() => void) | undefined;
  let completed = false;
  const handle = createAdapterHandle(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const dispose = createV1DisposeHook(handle);

  const pending = dispose().then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(!completed, "v1 dispose hook must await asynchronous cleanup");
  assert(release !== undefined, "cleanup must have started");

  release();
  await pending;
  assert(completed, "v1 dispose hook must resolve after cleanup completes");
}

void (async () => {
  await assertDisposeUsesGenerationOwner();
  await assertDisposeAwaitsCleanup();
})();
