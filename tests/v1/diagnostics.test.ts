import {
  ADAPTER_DIAGNOSTIC_SEVERITY,
  CAPABILITIES,
  type AdapterDiagnostic,
  type DiagnosticReporter,
} from "../../src/index";
import { reportDiagnostic } from "../../src/contract/diagnostics";
import {
  createV1HostDiagnosticReporter,
  resolveV1DiagnosticReporter,
} from "../../src/adapters/v1/diagnostics";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const diagnostic: AdapterDiagnostic = {
  severity: ADAPTER_DIAGNOSTIC_SEVERITY.warning,
  code: "test-warning",
  message: "recoverable condition",
  capability: CAPABILITIES.agentRegistration,
};

async function assertHostReporterMapsToStructuredV1Log(): Promise<void> {
  const entries: unknown[] = [];
  const reporter = createV1HostDiagnosticReporter({
    client: {
      app: {
        log(input) {
          entries.push(input);
        },
      },
    },
  });

  assert(reporter !== undefined, "v1 host logger must produce a diagnostic reporter");
  await reportDiagnostic(reporter, diagnostic);

  assert(entries.length === 1, "v1 host logger must receive one entry");
  const entry = entries[0] as {
    body: {
      service: string;
      level: string;
      message: string;
      extra: { code: string; capability?: string };
    };
  };
  assert(entry.body.service === "opencode-version-adapter", "v1 log must identify the adapter service");
  assert(entry.body.level === "warn", "warning diagnostics must map to v1 warn level");
  assert(entry.body.message === diagnostic.message, "v1 log must preserve the diagnostic message");
  assert(entry.body.extra.code === diagnostic.code, "v1 log must preserve the diagnostic code");
  assert(
    entry.body.extra.capability === diagnostic.capability,
    "v1 log must preserve the related capability",
  );
}


async function assertErrorDiagnosticMapsToV1ErrorLog(): Promise<void> {
  const entries: unknown[] = [];
  const reporter = createV1HostDiagnosticReporter({
    client: {
      app: {
        log(input) {
          entries.push(input);
        },
      },
    },
  });

  assert(reporter !== undefined, "v1 host logger must produce a diagnostic reporter");
  await reportDiagnostic(reporter, {
    severity: ADAPTER_DIAGNOSTIC_SEVERITY.error,
    code: "test-error",
    message: "adapter subsystem stopped",
  });

  assert(entries.length === 1, "v1 host logger must receive one error entry");
  const entry = entries[0] as { body: { level: string } };
  assert(entry.body.level === "error", "error diagnostics must map to v1 error level");
}

function assertExplicitReporterTakesPrecedence(): void {
  const explicit: DiagnosticReporter = () => {};
  const resolved = resolveV1DiagnosticReporter(
    {
      client: {
        app: {
          log() {
            throw new Error("host logger must not be selected");
          },
        },
      },
    },
    explicit,
  );

  assert(resolved === explicit, "explicit diagnostic reporter must override automatic v1 host delegation");
}

function assertMissingHostLoggerRemainsOptional(): void {
  assert(
    createV1HostDiagnosticReporter({}) === undefined,
    "absence of v1 host logging must not fabricate a diagnostic sink",
  );
}

void (async () => {
  await assertHostReporterMapsToStructuredV1Log();
  await assertErrorDiagnosticMapsToV1ErrorLog();
  assertExplicitReporterTakesPrecedence();
  assertMissingHostLoggerRemainsOptional();
})();
