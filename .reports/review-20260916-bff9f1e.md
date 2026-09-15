# Independent Code Review — opencode-version-adapter

- **Commit:** `bff9f1e` (2026-09-16)
- **Scope:** Full review of `src/` (contract, adapters/v1, adapters/v2, internal/server-plugin), `tests/` (23 files incl. `tests/runtime/real-loader-smoke.mjs`), and `openspec/` design/tasks documentation. No source files were modified.
- **Method:** Direct read of all source files against `openspec/.../design.md` (authoritative evidence doc) and `tasks.md`; static type-check (`npx tsc --noEmit --strict` on `src/index.ts` + `src/internal/server-plugin.ts` — clean); executed every test file individually under `bun` (23/23 pass); attempted `node --test` and `bun test` to document runner behavior; traced hook composition, disposal ordering, and capability preflight logic by hand.
- **Classification:** Findings are tiered **High-confidence** (verified against source, reproducible reasoning), **Plausible** (reasoned divergence or fragile invariant; not observed failing at runtime), and **Investigation-leads** (requires the unchecked Phase-5 runtime verification against real `opencode`/`opencode2` binaries).
- **Model:** `GLM-5.3` (self-reported; environment reports `zai-coding-plan/glm-5.3`)

## Summary

The adapter contract is well-designed: capability preflight runs before irreversible host mutations (tested in both generations), disposal runs in reverse setup order (tested), v2 unsupported capabilities fail closed via `assertRequiredCapabilitiesSupported`, and irreversible v1 workspace registration commits last. All 23 test files pass under `bun <file>`. The material issues are concentrated in (a) the v2 host-event pump's silent-failure behavior, (b) the absence of any documented, discoverable test command, and (c) an as-yet-unverified assumption about v2 agent-transform replay semantics that Phase 5 of `tasks.md` is explicitly designed to check.

---

## Findings

### [Fixed] C1. v2 host-event pump exits silently on first delivery error; all subsequent host events dropped until dispose

- **Severity:** Medium
- **Confidence:** High-confidence
- **Affected:** `src/adapters/v2/capabilities/host-event-delivery.ts` (pump loop, ~lines 44–58)
- **Description:** The background pump iterates the host's async event stream. Any throw from `deliver(next.value)` — or from `iterator.next()` itself — is caught, stored in `deliveryError`, and the pump loop exits. No error is re-thrown, logged, or surfaced through any callback at failure time; the stored error only surfaces when `dispose()` is called.
- **Why it matters:** A single throwing consumer callback (or a faulting host iterator) permanently and silently disables event delivery. Consumers relying on `sessionAgentModelObservation`-style event streams get no signal that delivery stopped; the failure is deferred to teardown, which may happen much later (or never, in a long-lived host).
- **Evidence:** Source read of the pump: catch block assigns `deliveryError` and returns from the loop; no early-error channel exists on the registration handle. Design.md L64 documents the `event.subscribe` lifecycle but does not specify failure surfacing.
- **Impact:** Silent loss of all host events after first error; delayed, confusing failure diagnosis.
- **Trigger:** Consumer `deliver` callback throws once; or host iterator raises. Then any subsequent events are unobserved.
- **Verification:** Unit-level: create a delivery stream fake whose callback throws on the first event, assert the second event is never delivered and no error is observable before `dispose()`. Decide intended semantics (skip-and-continue, error callback, or immediate disposal) and encode in test.

#### Update — 2026-09-16 08:57 — Base 58cbaa5

Verified the fail-stop path with a throwing consumer callback. The pump now preserves its existing fail-stop and cleanup-error semantics while emitting one immediate `error` diagnostic with code `host-event-delivery-failed` through the optional reporter. V2 setup forwards the reporter to capability mappings, and regression coverage verifies the diagnostic is emitted before disposal, later events remain undelivered, and disposal still surfaces the original failure. TypeScript 5.8.3 compilation succeeded and all 25 generated test files passed under Node; the OpenSpec CLI is not installed in this environment, so strict OpenSpec validation was not re-run.

### [ ] C2. v2 host-event `dispose()` can hang indefinitely if `deliver()` never settles

- **Severity:** Low
- **Confidence:** High-confidence
- **Affected:** `src/adapters/v2/capabilities/host-event-delivery.ts` (cleanup, ~lines 60–80)
- **Description:** `dispose()` sets `stopping = true`, calls `iterator.return()`, then `await`s the pump promise. If the pending `deliver(next.value)` promise never resolves or rejects (a stuck consumer callback), the pump never exits and `dispose()` hangs forever. There is no timeout or race.
- **Why it matters:** Teardown hangs are worse than teardown errors in long-lived hosts; the adapter's otherwise-consistent reverse-order disposal chain would stall at this registration.
- **Evidence:** Direct read of cleanup sequence; the only awaits are `iterator.return()` and the pump promise, neither raced against a timeout.
- **Impact:** Adapter teardown deadlock when a consumer callback stalls.
- **Trigger:** `dispose()` called while `deliver()` has a pending, never-settling promise in flight.
- **Verification:** Unit test with a deliver callback returning a never-settling promise on the final in-flight event; assert dispose either completes (with timeout race) or document the hang as accepted semantics.

### [Fixed] C3. `createAdapterHandle` swallows synchronous cleanup failures on repeated dispose

- **Severity:** Low
- **Confidence:** High-confidence
- **Affected:** `src/contract/lifecycle.ts` (`createAdapterHandle`, ~lines 24–42)
- **Description:** If `cleanup()` throws **synchronously**, `started` is already `true` but `pending` remains `undefined`; the promise-wrapping that would populate `pending` never runs. A second `dispose()` call then takes the "already disposed" path and returns `undefined` (success), permanently swallowing the original failure. An **asynchronously** rejecting cleanup, by contrast, is cached in `pending` and re-thrown on every subsequent `dispose()` call.
- **Why it matters:** Inconsistent idempotency/error semantics for the two failure modes of the same operation. Practical exposure is low because both v1 and v2 adapters wrap their cleanup bodies in `async` functions (converting sync throws to async rejections), but the lifecycle primitive is contract-level and directly usable.
- **Evidence:** Read of the handle implementation: the sync-throw path bypasses `pending` assignment; second call checks `pending`/`started` state and returns early.
- **Impact:** Direct consumers of `createAdapterHandle` (outside the built-in adapters) can silently lose cleanup failures.
- **Trigger:** Call `dispose()` twice where the underlying cleanup throws synchronously on the first call.
- **Verification:** Unit test against the contract helper with a sync-throwing cleanup; assert second `dispose()` rejects identically (after fix) or document current behavior.

#### Update — 2026-09-16 07:42 — Base bff9f1e

Reproduced directly against `src/contract/lifecycle.ts`: the first `dispose()` re-threw the synchronous cleanup error while the second resolved because `started` was set before `pending` could be assigned. The handle now caches a synchronous failure separately and rethrows the same value on repeated disposal without changing the successful synchronous or asynchronous cleanup paths. Added a contract regression test that invokes the failing handle twice and requires the same error both times.

### [Fixed] C4. Duplicate capability ids in `requiredCapabilities` cause double installation

- **Severity:** Low
- **Confidence:** High-confidence
- **Affected:** `src/adapters/v1/adapter.ts` and `src/adapters/v2/adapter.ts` (`setup`, setup-order derivation)
- **Description:** `setupOrder` is derived directly by iterating `requiredCapabilities`. The `Map` used to look up adapters deduplicates adapter instances, but the iteration itself does not deduplicate capability ids, so a duplicated id installs the same capability twice — double transform registration (v2 agent domain), double hook registration, and double side effects at dispose (out-of-balance disposal counts).
- **Why it matters:** `requiredCapabilities` is consumer input; nothing validates uniqueness. Double registration of e.g. `agentRegistration` produces two conflicting transforms.
- **Evidence:** Read of setup-order construction (plain iteration, no dedup); v2 `orderCapabilities` handles duplicate perm/reg entries correctly for *ordering* but the install loop still runs per occurrence.
- **Impact:** Surprising double side effects for malformed-but-type-valid input.
- **Trigger:** Pass `requiredCapabilities: [agentRegistration, agentRegistration]`.
- **Verification:** Either dedupe ids when building setup order or reject duplicates with a contract validation error; add a unit test.

#### Update — 2026-09-16 08:36 — Base 6b29bb3

Verified that both generation adapters previously iterated duplicate `requiredCapabilities` entries through installation. Per the updated OpenSpec set semantics, setup now normalizes requirements to first-occurrence order before support validation and dependency ordering, emits at most one best-effort `duplicate-required-capability` warning per duplicated capability id, and installs/owns each distinct mapping once. Added v1 coverage for repeated ids and balanced cleanup plus v2 coverage proving deduplication occurs before agent-registration/permission dependency ordering. TypeScript 5.8.3 compilation succeeded and all 25 generated test files passed under Node; the OpenSpec CLI is not installed in this environment, so strict OpenSpec validation was not re-run.

### [Fixed] C5. No documented or discoverable test command; test suite is not runner-compatible

- **Severity:** Medium (maintainability)
- **Confidence:** High-confidence
- **Affected:** repo root (no `package.json` — intentional per design.md L244 — but also no README/scripts/AGENTS documentation of testing), all 23 files under `tests/`
- **Description:** Tests are script-style (`void (async () => { ... })()`) and import extensionless TS paths (`../../src/index`). Verified behavior: `node --test` fails (extensionless ESM imports cannot resolve); `bun <file>` runs each file correctly (I executed all 23: pass 23 / fail 0); `bun test` collects **0** tests (no test-runner registration). No document states how to run the suite.
- **Why it matters:** A reviewer or CI system cannot discover the correct invocation; `bun test` silently reports zero tests, which reads as a green run while executing nothing.
- **Evidence:** Executed all three invocation modes; grepped repo for test documentation (none found).
- **Impact:** Suite cannot be CI-gated; false-green risk with `bun test`.
- **Trigger:** Any contributor or CI attempting to validate the repo.
- **Verification:** Document `bun tests/<file>` (or `fd -e ts . tests | xargs -I{} bun {}`) in README/AGENTS.md, or convert tests to `bun:test` registrations so `bun test` actually collects them.

#### Update — 2026-09-16 07:58 — Base ce08eec

Added root-level `TESTING.md` documenting the canonical PowerShell verification flow: compile `src/` and `tests/` with TypeScript 5.8.3 into `.tmp-test`, execute every generated `*.test.js` with Node, then run strict OpenSpec validation. The document also records the real-loader smoke command and explicitly warns that `bun test` collects zero tests and direct `node --test` is not the supported path. The equivalent compile-and-run path was executed in this environment with TypeScript 5.8.3 and all 23 generated test files passed under Node; the OpenSpec CLI is not installed here, so strict OpenSpec validation was not re-run. This fixes test-command discoverability without introducing package-manager metadata or choosing a new build system.

### [ ] C6. `toV2ModelRequestIdentity` performs no runtime guard on `input.model`

- **Severity:** Minor
- **Confidence:** High-confidence
- **Affected:** `src/adapters/v2/session-model.ts` (~lines 35–43)
- **Description:** The mapping dereferences `input.model` (and nested fields) without a null/shape guard. A malformed host event (model absent) throws a raw `TypeError` from inside the hook callback rather than a contract error.
- **Why it matters:** Hook callbacks that throw raw `TypeError` interact with the C1 pump behavior (silent stream death) and bypass the adapter's error taxonomy.
- **Evidence:** Read of the function body — direct property access chain, no validation.
- **Impact:** Cryptic failure mode on malformed host input; compounds C1.
- **Trigger:** Host emits `model.request`-shaped event without `model`.
- **Verification:** Add a guard that either filters the event or raises a typed error; unit test with `model: undefined`.

### [ ] C7. Raw `TypeError` thrown outside the `VersionAdapterError` family in v2 surface validation

- **Severity:** Minor (cosmetic/consistency)
- **Confidence:** High-confidence
- **Affected:** `src/adapters/v2/capabilities/server-lifecycle.ts` (`createV2ServerDefinition` id check, workspace type check), `src/adapters/v2/session-model.ts` (`toV2AgentModelRef`)
- **Description:** Several input-validation sites throw bare `TypeError`/`Error` instead of members of the `VersionAdapterError` family defined in `src/contract/errors.ts`, unlike the rest of the surface which uses typed errors (e.g. `AdapterInitializationError`).
- **Why it matters:** Consumers cannot reliably distinguish contract violations from programming bugs via `instanceof VersionAdapterError`.
- **Evidence:** Read of the throw sites vs. the errors module taxonomy.
- **Impact:** Inconsistent error handling for downstream consumers.
- **Trigger:** Passing invalid id/workspace/model-ref values.
- **Verification:** Either map these sites to a typed error subclass or document `TypeError` as intentional input-validation behavior.

### [ ] C8. Dead defensive re-check inside adapter install loops

- **Severity:** Info (noise)
- **Confidence:** High-confidence
- **Affected:** `src/adapters/v1/adapter.ts` (~lines 88–93), `src/adapters/v2/adapter.ts` (~lines 80–85)
- **Description:** The `adapter === undefined` re-check inside the install loop is unreachable: the missing-capability preflight already guarantees every required id resolves to an adapter before the loop begins.
- **Why it matters:** Purely informational; the branch can never execute and slightly obscures the real invariant.
- **Evidence:** Read of preflight (throws `AdapterInitializationError` on any unresolved id) preceding the loop.
- **Impact:** None at runtime.
- **Trigger:** N/A (unreachable).
- **Verification:** Optional cleanup with a type-level exhaustiveness note; no behavior change.

### [ ] C9. Cross-generation behavioral divergence: gate rejection suppresses observation in v1 but not v2

- **Severity:** Low–Medium (semantic contract clarity)
- **Confidence:** Plausible
- **Affected:** `src/adapters/v1/integrated-adapter.ts` (chat.params handler composition, ~lines 123–148) vs `src/adapters/v2` independent hooks (`model.request` gate + `context` observation, design.md L64)
- **Description:** In v1, gate and observation share one `chat.params` hook; the gate handler is pushed first and the shared hook awaits handlers sequentially. If the gate throws (rejects the request), the observation callback for that same request never runs — rejected requests are unobserved. In v2 the observation uses a separate `context` hook, so a gate rejection does not suppress it. The same pair of bindings therefore behaves differently across generations.
- **Why it matters:** The library's purpose is cross-generation equivalence; this is a real semantic difference, not just an implementation detail. It may be intentional (v1's single hook makes independence impossible) but is not documented as a known divergence in design.md.
- **Evidence:** v1 integrated-adapter handler ordering `[gate, observation]` with sequential await (happy-path ordering asserted in `tests/v1/integrated-adapter.test.ts` — "gate|observe" — but no rejection-path test); v2 uses two independent, separately disposable registrations.
- **Impact:** Consumers porting observation semantics from v2 to v1 (or comparing telemetry across hosts) see fewer observations in v1 whenever the gate rejects.
- **Trigger:** Bind both `modelRequestGate` (that rejects some requests) and `sessionAgentModelObservation` on v1; issue a rejected request.
- **Verification:** Add a v1 test asserting observation is skipped when the gate throws; document the divergence in design.md or reorder so observation runs before the gate (if observation of rejected requests is desired).

### [ ] C10. v1 config hook's shallow-copy draft shares per-agent record values with the host config object

- **Severity:** Low (fragile invariant, not a live bug)
- **Confidence:** Plausible
- **Affected:** `src/adapters/v1/config.ts` (`createV1ConfigHook`)
- **Description:** The staged draft is built as `{ ...config, agent: { ...config.agent } }` — the per-agent record *values* are shared by reference with the host's config object. Safety depends on every current and future handler replacing agent records wholesale (e.g. `next[id] = ...`) rather than mutating them in place. Today both the registration handler (`next[id] = ...`) and the permission handler (`{ ...current, permission }`) respect this, so no live mutation occurs; also, `commitKnownConfigFields`'s delete branches are unreachable because the keys are always present after handlers run.
- **Why it matters:** The invariant is implicit. A future handler that mutates a nested record would corrupt the host's live config despite the "staged draft, commit after success" design (design.md L73).
- **Evidence:** Read of draft construction and both current handlers; delete-branch reachability analysis.
- **Impact:** Latent config-corruption hazard under future handler changes.
- **Trigger:** Any future v1 config handler mutating a nested agent record in the draft.
- **Verification:** Deep-copy the `agent` record values into the draft (or add an assertion/handler contract note); add a mutation-attempt regression test.

### [ ] C11. v2 permission-rule install-time validation assumes `agent.list()` already reflects transforms registered moments earlier

- **Severity:** Unknown (blocks on runtime verification)
- **Confidence:** Investigation-lead
- **Affected:** `src/adapters/v2/capabilities/agent-permission-rules.ts` (install-time validation via `new Set((await agent.list()) ...)`), design.md L72 (replay semantics)
- **Description:** The permission capability validates agent ids against `agent.list()` at install time, relying on the host's list to reflect the registration transform installed earlier in the same setup (design.md L72: State replays agent transforms in registration order). All tests encode this assumption via fakes (`RebuildOnReplayAgentDomain`-style fakes re-run all transforms from a fresh base on every register/dispose). Whether real opencode v2.0.3 agent state actually replays/append-semantics this way is exactly what unchecked tasks 5.2/5.3 are meant to confirm.
- **Why it matters:** If the real host's `list()` is eventually-consistent, snapshot-based, or append-only (rather than replay-from-base), install-time validation could reject valid ids or accept ids that later disappear.
- **Evidence:** Read of validation logic + test fakes; `tasks.md` Phase 5 items 5.2/5.3 unchecked; `tests/runtime/real-loader-smoke.mjs` exists but does not cover this path.
- **Impact:** Potential spurious `AdapterInitializationError` (or missed validation) against the real runtime only.
- **Trigger:** Running the integrated v2 adapter with registration + permission bindings against real opencode v2.0.3.
- **Verification:** Execute tasks 5.2/5.3 against the real `opencode2` binary; specifically assert `list()` visibility of an agent registered via `transform()` in the same setup phase.

### [ ] C12. Runtime verification (Phase 5) incomplete; smoke harness present but unexercised

- **Severity:** Medium (process gap, not a code defect)
- **Confidence:** Investigation-lead
- **Affected:** `tasks.md` (5.1–5.3 unchecked), `tests/runtime/real-loader-smoke.mjs`
- **Description:** All conclusions above are static-analysis- and fake-based. The real-loader smoke script is well-built (Windows `cmd` wrapping, `taskkill /T /F`, output caps, timeouts, TS import via `pathToFileURL`) but requires `opencode`/`opencode2` binaries on PATH; I did not execute it. Phase 5 (5.1 loader wiring, 5.2/5.3 runtime behavior) and Phases 6–7 remain unchecked in `tasks.md`.
- **Why it matters:** The project's own plan flags real-runtime behavior — especially C11's replay assumption and loader hook selection (design.md L79–81: v1 picks `server`, v2 picks `id`+`setup`) — as unverified.
- **Evidence:** `tasks.md` checkbox state; review of smoke script (not executed — binaries/Task 5.1 outside this review's scope).
- **Impact:** Unknown residual risk concentrated in host-integration assumptions.
- **Trigger:** Running the adapter against real host binaries.
- **Verification:** Complete tasks 5.1–5.3, then re-review C11 and the loader-selection assumptions against observed behavior.

---

## Verified-correct behaviors (no action needed)

- **Preflight ordering:** unbound-but-required capabilities fail with `AdapterInitializationError` *before* irreversible host mutations, in both generations (explicitly tested in both integrated-adapter tests: `registrations === 0` / `subscriptions === 0`).
- **Disposal ordering:** reverse-setup-order disposal asserted for v2 session/tool/agent registrations.
- **v2 capability gating:** `subagentDepth`/`workspaceRegistration` fail closed in v2 (`assertRequiredCapabilitiesSupported`); `server-plugin.ts` v2 path omits them consistently.
- **v2 `orderCapabilities`:** correct placement of permission-after-registration for all `[perm, reg]` permutations including duplicates.
- **v1 subagent depth:** `Math.max(existing ?? 1, minimumDepth)` with safe-integer validation on both sides, failing at handler creation.
- **v2 successful-tool-completion:** filters `status !== 'completed'` correctly; maps `input` → `args`.
- **v1 Task failure path:** `tool.execute.after` with `undefined` output correctly filtered (design.md L67).
- **Public boundary:** `src/index.ts` intentionally excludes `createOpenCodeServerPlugin` (design.md L87, Task 5.1 pending) — not a defect.

## Metadata

- Reviewed: 24 `src/` files, 23 `tests/` files, `openspec/` design.md + tasks.md, smoke harness.
- Commands run: `npx tsc --noEmit --strict` (clean); `bun <each of 23 test files>` (23 pass / 0 fail); `node --test` (fails — extensionless imports); `bun test` (0 tests collected).
- No source files were modified. Report written to `.reports/review-20260916-bff9f1e.md` (file did not previously exist).
