import type {
  AdapterDiagnostic,
  DiagnosticReporter,
} from "../../contract/diagnostics";
import type { MaybePromise } from "../../contract/lifecycle";

interface V1AppLogInput {
  readonly body: {
    readonly service: "opencode-version-adapter";
    readonly level: "warn";
    readonly message: string;
    readonly extra: {
      readonly code: string;
      readonly capability?: string;
    };
  };
}

/** Narrow structural subset of the v1 SDK client used for host diagnostics. */
export interface V1DiagnosticContext {
  readonly client?: {
    readonly app?: {
      log(input: V1AppLogInput): MaybePromise<unknown>;
    };
  };
}

/** Map a shared adapter diagnostic to OpenCode v1 structured host logging. */
export function createV1HostDiagnosticReporter(
  context: V1DiagnosticContext,
): DiagnosticReporter | undefined {
  const app = context.client?.app;
  if (app === undefined || typeof app.log !== "function") {
    return undefined;
  }

  return async (diagnostic: AdapterDiagnostic) => {
    await app.log({
      body: {
        service: "opencode-version-adapter",
        level: "warn",
        message: diagnostic.message,
        extra: {
          code: diagnostic.code,
          ...(diagnostic.capability === undefined
            ? {}
            : { capability: diagnostic.capability }),
        },
      },
    });
  };
}

/** Prefer an explicit consumer reporter; otherwise use verified v1 host logging. */
export function resolveV1DiagnosticReporter(
  context: V1DiagnosticContext,
  reporter: DiagnosticReporter | undefined,
): DiagnosticReporter | undefined {
  return reporter ?? createV1HostDiagnosticReporter(context);
}
