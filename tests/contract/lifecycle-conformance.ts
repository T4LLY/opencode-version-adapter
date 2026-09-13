import type {
  AdapterHandle,
  MaybePromise,
} from "../../src/contract/lifecycle";

export const LIFECYCLE_TEST_MODE = Object.freeze({
  succeed: "succeed",
  failAfterAcquire: "fail-after-acquire",
} as const);

export type LifecycleTestMode =
  (typeof LIFECYCLE_TEST_MODE)[keyof typeof LIFECYCLE_TEST_MODE];

export interface LifecycleConformanceTarget {
  readonly events: readonly string[];
  getCleanupCount(): number;
  setup(mode: LifecycleTestMode): MaybePromise<AdapterHandle>;
}

export type CreateLifecycleConformanceTarget = () => LifecycleConformanceTarget;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function captureError(action: () => MaybePromise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  return undefined;
}

/**
 * Shared lifecycle contract suite for generation adapters.
 *
 * Each generation adapter can provide a fresh target around its real setup
 * path. The suite verifies the observable ownership contract without knowing
 * how that generation installs or removes resources.
 */
export async function runLifecycleConformanceSuite(
  createTarget: CreateLifecycleConformanceTarget,
): Promise<void> {
  await assertSuccessfulSetupHasOneCleanupOwner(createTarget);
  await assertPartialSetupRollsBack(createTarget);
  await assertDisposalIsIdempotent(createTarget);
}

async function assertSuccessfulSetupHasOneCleanupOwner(
  createTarget: CreateLifecycleConformanceTarget,
): Promise<void> {
  const target = createTarget();
  const handle = await target.setup(LIFECYCLE_TEST_MODE.succeed);

  assert(
    typeof handle.dispose === "function",
    "successful setup must return one generation-level cleanup owner",
  );
  assert(
    target.getCleanupCount() === 0,
    "successful setup must retain owned resources until disposal",
  );

  await handle.dispose();

  assert(
    target.getCleanupCount() === 1,
    "generation-level cleanup owner must release the acquired resource",
  );
}

async function assertPartialSetupRollsBack(
  createTarget: CreateLifecycleConformanceTarget,
): Promise<void> {
  const target = createTarget();
  const error = await captureError(() =>
    target.setup(LIFECYCLE_TEST_MODE.failAfterAcquire),
  );

  assert(error instanceof Error, "failed setup must surface its failure");
  assert(
    target.getCleanupCount() === 1,
    "failed partial setup must release resources acquired by that attempt",
  );

  const cleanupIndex = target.events.indexOf("cleanup");
  const failureIndex = target.events.indexOf("surface-failure");
  assert(
    cleanupIndex >= 0 && failureIndex > cleanupIndex,
    "partial setup cleanup must complete before the setup failure is surfaced",
  );
}

async function assertDisposalIsIdempotent(
  createTarget: CreateLifecycleConformanceTarget,
): Promise<void> {
  const target = createTarget();
  const handle = await target.setup(LIFECYCLE_TEST_MODE.succeed);

  await handle.dispose();
  await handle.dispose();

  assert(
    target.getCleanupCount() === 1,
    "repeated disposal must not repeat destructive teardown",
  );
}
