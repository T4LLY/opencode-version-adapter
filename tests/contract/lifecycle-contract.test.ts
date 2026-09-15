import {
  createAdapterHandle,
  type AdapterHandle,
  type Cleanup,
} from "../../src/contract/lifecycle.js";
import {
  LIFECYCLE_TEST_MODE,
  runLifecycleConformanceSuite,
  type LifecycleConformanceTarget,
  type LifecycleTestMode,
} from "./lifecycle-conformance.js";

class SyntheticLifecycleTarget implements LifecycleConformanceTarget {
  private cleanupCount = 0;
  readonly events: string[] = [];

  getCleanupCount(): number {
    return this.cleanupCount;
  }

  async setup(mode: LifecycleTestMode): Promise<AdapterHandle> {
    this.events.push("acquire");

    const cleanup: Cleanup = () => {
      this.cleanupCount += 1;
      this.events.push("cleanup");
    };

    if (mode === LIFECYCLE_TEST_MODE.failAfterAcquire) {
      const failure = new Error("synthetic setup failure");
      await cleanup();
      this.events.push("surface-failure");
      throw failure;
    }

    return createAdapterHandle(cleanup);
  }
}

async function assertSynchronousCleanupFailureIsStable(): Promise<void> {
  const failure = new Error("synthetic synchronous cleanup failure");
  const handle = createAdapterHandle(() => {
    throw failure;
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let caught: unknown;
    try {
      await handle.dispose();
    } catch (error) {
      caught = error;
    }

    if (caught !== failure) {
      throw new Error(
        "repeated disposal must preserve a synchronous cleanup failure",
      );
    }
  }
}

void (async () => {
  await runLifecycleConformanceSuite(() => new SyntheticLifecycleTarget());
  await assertSynchronousCleanupFailureIsStable();
})();
