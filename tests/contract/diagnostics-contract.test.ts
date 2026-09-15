import {
  ADAPTER_DIAGNOSTIC_SEVERITY,
  CAPABILITIES,
  type AdapterDiagnostic,
  type DiagnosticReporter,
} from "../../src/index.js";
import { reportDiagnostic } from "../../src/contract/diagnostics.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const diagnostic: AdapterDiagnostic = {
  severity: ADAPTER_DIAGNOSTIC_SEVERITY.warning,
  code: "test-warning",
  message: "recoverable condition",
  capability: CAPABILITIES.serverLifecycle,
};

function assertPublicSeveritySet(): void {
  assert(
    ADAPTER_DIAGNOSTIC_SEVERITY.warning === "warning",
    "warning diagnostic severity must remain stable",
  );
  assert(
    ADAPTER_DIAGNOSTIC_SEVERITY.error === "error",
    "error diagnostic severity must be publicly available",
  );

  const errorDiagnostic: AdapterDiagnostic = {
    severity: ADAPTER_DIAGNOSTIC_SEVERITY.error,
    code: "test-error",
    message: "adapter subsystem stopped",
  };
  assert(errorDiagnostic.severity === "error", "error diagnostics must satisfy the public contract");
}

async function assertReporterReceivesStructuredDiagnostic(): Promise<void> {
  const received: AdapterDiagnostic[] = [];
  const reporter: DiagnosticReporter = (value) => {
    received.push(value);
  };

  await reportDiagnostic(reporter, diagnostic);

  assert(received.length === 1, "diagnostic reporter must receive one value");
  assert(received[0] === diagnostic, "diagnostic reporter must receive the original structured value");
}

async function assertMissingReporterIsSilent(): Promise<void> {
  let warnings = 0;
  const originalWarn = console.warn;
  console.warn = () => {
    warnings += 1;
  };

  try {
    await reportDiagnostic(undefined, diagnostic);
  } finally {
    console.warn = originalWarn;
  }

  assert(warnings === 0, "missing diagnostic reporter must not fall back to console.warn");
}

async function assertReporterFailureIsIsolated(): Promise<void> {
  await reportDiagnostic(() => {
    throw new Error("sync reporter failure");
  }, diagnostic);

  await reportDiagnostic(async () => {
    throw new Error("async reporter failure");
  }, diagnostic);
}

void (async () => {
  assertPublicSeveritySet();
  await assertReporterReceivesStructuredDiagnostic();
  await assertMissingReporterIsSilent();
  await assertReporterFailureIsIsolated();
})();
