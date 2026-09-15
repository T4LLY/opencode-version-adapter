import type { CapabilityId } from "./capabilities";
import type { MaybePromise } from "./lifecycle";

export const ADAPTER_DIAGNOSTIC_SEVERITY = Object.freeze({
  warning: "warning",
  error: "error",
} as const);

export type AdapterDiagnosticSeverity =
  (typeof ADAPTER_DIAGNOSTIC_SEVERITY)[keyof typeof ADAPTER_DIAGNOSTIC_SEVERITY];

/** Generation-independent diagnostic emitted for adapter operating conditions. */
export interface AdapterDiagnostic {
  readonly severity: AdapterDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly capability?: CapabilityId;
}

/** Optional consumer-owned sink for adapter diagnostics. */
export type DiagnosticReporter = (
  diagnostic: AdapterDiagnostic,
) => MaybePromise<void>;

/**
 * Deliver an adapter diagnostic without allowing reporter failures to alter
 * adapter control flow. Absence of a reporter is intentionally silent.
 */
export async function reportDiagnostic(
  reporter: DiagnosticReporter | undefined,
  diagnostic: AdapterDiagnostic,
): Promise<void> {
  if (reporter === undefined) {
    return;
  }

  try {
    await reporter(diagnostic);
  } catch {
    // Diagnostics are best-effort by contract.
  }
}
