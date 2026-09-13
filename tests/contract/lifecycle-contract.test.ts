import {
  createAdapterHandle,
  type AdapterHandle,
  type Cleanup,
} from "../../src/contract/lifecycle";
import {
  LIFECYCLE_TEST_MODE,
  runLifecycleConformanceSuite,
  type LifecycleConformanceTarget,
  type LifecycleTestMode,
} from "./lifecycle-conformance";

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

void runLifecycleConformanceSuite(() => new SyntheticLifecycleTarget());
