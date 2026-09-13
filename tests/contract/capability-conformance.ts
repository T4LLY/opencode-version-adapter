import {
  ADAPTER_ERROR_CATEGORY,
  CAPABILITIES,
  CAPABILITY_SUPPORT,
  UnsupportedCapabilityError,
  VersionAdapterError,
  type CapabilityId,
  type CapabilitySupportMap,
  type RequiredCapabilities,
} from "../../src/index";

export interface CapabilityConformanceTarget {
  readonly support: CapabilitySupportMap;
  assertRequired(required: RequiredCapabilities): void;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  return undefined;
}

const capabilityIds = Object.values(CAPABILITIES);
const supportStates = new Set(Object.values(CAPABILITY_SUPPORT));

/**
 * Reusable shared-contract suite for generation adapters.
 *
 * Adapter tests provide a thin target around their own support metadata and
 * required-capability preflight. The suite deliberately depends only on the
 * package-root contract so it does not make generation internals public API.
 */
export function runCapabilityConformanceSuite(
  target: CapabilityConformanceTarget,
): void {
  for (const capability of capabilityIds) {
    const state = target.support[capability];

    assert(
      supportStates.has(state),
      `capability ${capability} must have an explicit support state`,
    );

    if (state === CAPABILITY_SUPPORT.unsupported) {
      assertUnsupportedCapability(target, capability);
      continue;
    }

    target.assertRequired([capability]);
  }

  const supportedCapabilities = capabilityIds.filter(
    (capability) =>
      target.support[capability] !== CAPABILITY_SUPPORT.unsupported,
  );
  target.assertRequired(supportedCapabilities);
}

function assertUnsupportedCapability(
  target: CapabilityConformanceTarget,
  capability: CapabilityId,
): void {
  const error = captureError(() => target.assertRequired([capability]));

  assert(
    error instanceof UnsupportedCapabilityError,
    `unsupported capability ${capability} must fail with UnsupportedCapabilityError`,
  );
  assert(
    error instanceof VersionAdapterError,
    `unsupported capability ${capability} must remain inside the stable adapter error family`,
  );
  assert(
    error.category === ADAPTER_ERROR_CATEGORY.unsupportedCapability,
    `unsupported capability ${capability} must expose the unsupported-capability category`,
  );
  assert(
    error.capability === capability,
    `unsupported capability failure must retain capability id ${capability}`,
  );
}
