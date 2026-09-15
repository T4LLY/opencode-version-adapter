# Usage Guidelines

`opencode-version-adapter` is the OpenCode compatibility boundary. Consumers should depend on its normalized contract rather than OpenCode generation-specific behavior.

## Generation boundaries

Do not branch on OpenCode v1/v2 behavior in normal consumer code when the adapter already owns that difference.

If a required behavior differs by OpenCode generation, prefer extending the adapter contract instead of exposing generation-specific APIs to consumers.

Do not treat OpenCode SDK types as the shared consumer contract. SDK response envelopes and other host-specific shapes should remain behind the adapter boundary.

## Required capabilities

`requiredCapabilities` declares behavior that must be available for setup to succeed. Only declare capabilities whose absence should prevent the consumer from operating correctly.

Capability requirements are set-like. Duplicate capability ids are tolerated, reported through diagnostics when available, and installed only once.

Do not use required capabilities as a list of optional features. Unsupported required capabilities are expected to fail closed rather than silently degrade into unrelated fallback behavior.

## Diagnostics

Connecting a `DiagnosticReporter` is strongly recommended for production and integration use. Tests and small local tools may omit it when diagnostics are not useful.

The adapter does not implicitly fall back to `console.warn` or `console.error` when no reporter is provided.

Treat diagnostic severities as follows:

- `warning` describes a recoverable condition where the adapter can continue with defined behavior.
- `error` describes a condition where an adapter subsystem can no longer continue its intended work, even if the overall host remains alive.

Diagnostic delivery is best-effort. A diagnostic reporter must not become a new source of failure for the operation being reported.

## Lifecycle

The component that successfully sets up an adapter owns the returned handle and is responsible for disposing it during shutdown, reload, or replacement.

Do not rely on process termination as cleanup. Disposal may release host registrations, transforms, subscriptions, or other resources owned by the adapter.

Repeated disposal is safe, but normal ownership should remain simple: one owner should manage the handle and dispose it when that ownership ends.

Cleanup errors should be observed rather than silently discarded.

## Host-event callbacks

Keep host-event delivery callbacks short and non-blocking where practical.

If event handling requires expensive, long-running, or independently retryable work, hand the event to a consumer-owned queue and return from the callback promptly.

When a callback receives an `AbortSignal`:

- observe the signal;
- stop cancellable work when it becomes aborted;
- do not intentionally continue new side effects after cancellation;
- do not use a never-settling callback as a way to retain ownership after disposal.

Cancellation is cooperative. The adapter can signal cancellation but cannot forcibly terminate arbitrary consumer code that ignores the signal.

## Observation and admission control

`sessionAgentModelObservation` observes an attempted model-request identity at the adapter boundary. It does not mean that the request passed admission control or reached the provider.

`modelRequestGate` controls whether the request may continue. A request rejected by the gate may already have been observed.

Telemetry and downstream state should therefore distinguish an attempted request from a successfully admitted or executed request.

## Host data and normalized data

Consume normalized adapter values rather than interpreting OpenCode host payloads directly.

For example, generation-specific SDK response envelopes are an implementation detail of the OpenCode-facing adapter and should not be propagated into application domain types.

If the upstream OpenCode API changes shape, update and verify the adapter boundary instead of adding host-shape handling throughout consumers.

## Version support

Do not assume that an unknown OpenCode release behaves like the latest supported release.

New generation or version support should be based on the relevant upstream source/API contract and practical runtime verification. Unsupported required behavior should fail closed until compatibility is established.
