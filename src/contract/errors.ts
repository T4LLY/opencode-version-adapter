import type { CapabilityId } from "./capabilities";

export const ADAPTER_ERROR_CATEGORY = {
  unsupportedCapability: "unsupported-capability",
  initializationFailure: "initialization-failure",
  invalidHostContext: "invalid-host-context",
} as const;

export type AdapterErrorCategory =
  (typeof ADAPTER_ERROR_CATEGORY)[keyof typeof ADAPTER_ERROR_CATEGORY];

export class VersionAdapterError extends Error {
  readonly category: AdapterErrorCategory;

  protected constructor(
    category: AdapterErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.category = category;
    this.name = new.target.name;
  }
}

export class UnsupportedCapabilityError extends VersionAdapterError {
  readonly capability: CapabilityId;

  constructor(capability: CapabilityId, options?: ErrorOptions) {
    super(
      ADAPTER_ERROR_CATEGORY.unsupportedCapability,
      `Required capability is unsupported: ${capability}`,
      options,
    );
    this.capability = capability;
  }
}

export class AdapterInitializationError extends VersionAdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super(ADAPTER_ERROR_CATEGORY.initializationFailure, message, options);
  }
}

export class InvalidHostContextError extends VersionAdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super(ADAPTER_ERROR_CATEGORY.invalidHostContext, message, options);
  }
}
