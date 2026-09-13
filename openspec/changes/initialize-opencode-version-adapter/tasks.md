# Tasks

## 1. Establish the initial capability inventory

- [ ] 1.1 Trace FOA's current OpenCode integration and record every actually used host capability; verify the inventory against the current FOA source rather than inferred API names.
- [ ] 1.2 Trace the corresponding behavior in the supported OpenCode v1 and v2 sources; verify each mapping includes execution timing, lifecycle, payload, cleanup, and error semantics.
- [ ] 1.3 Update `specs/version-adaptation/spec.md` with only the concrete capabilities proven necessary by 1.1 and 1.2; verify `openspec validate initialize-opencode-version-adapter --type change --strict` succeeds.

## 2. Define the minimum shared contract

- [ ] 2.1 Define the smallest shared types required by the approved capability set; verify no unused OpenCode API surface is exposed.
- [ ] 2.2 Define explicit native, emulated, and unsupported support metadata for each implemented capability; verify required unsupported capabilities are representable before adapter setup.
- [ ] 2.3 Add contract tests for the shared observable semantics; verify the same suite can be run against each adapter that claims support.
- [ ] 2.4 Establish the initial module boundaries from `design.md`; verify `contract/` does not import generation adapters, v1/v2 adapters do not import each other, and generation `adapter.ts` files contain composition rather than detailed capability mappings.
- [ ] 2.5 Define lifecycle ownership for setup success, partial setup rollback, and idempotent disposal; verify lifecycle tests cover all three cases before runtime integration.
- [ ] 2.6 Define stable adapter error categories for unsupported capability, initialization failure, and invalid host context; verify generation-specific failures can be retained as diagnostic causes without becoming consumer contracts.
- [ ] 2.7 Define the documented public export boundary; verify consumers and tests do not depend on `internal/` or generation implementation paths unless an explicit public export is approved.

## 3. Establish the OpenCode v1 baseline

- [ ] 3.1 Implement only the v1 mappings required by the approved capability set; verify existing FOA behavior remains unchanged in v1-focused tests.
- [ ] 3.2 Evaluate `opencode-plugin-compat` only for required v1 behavior and use it only where its semantics match; verify no dependency is added solely for unused API coverage.

## 4. Implement the OpenCode v2 adapter

- [ ] 4.1 Review the current `oh-my-opencode-slim` v2 bridge and identify generic versus application-specific components; verify reused code is license-compatible, required notices are retained, and source project/path/revision provenance is recorded.
- [ ] 4.2 Implement only the generic v2 mappings required by the approved capability set; verify no oh-my-opencode-slim-specific orchestration, background jobs, prompts, or policy is included.
- [ ] 4.3 Add v2 adapter tests for each claimed native or emulated capability; verify unsupported required capabilities fail explicitly.
- [ ] 4.4 Before adding each new capability mapping, review responsibility concentration against `design.md`; split capability mapping, lifecycle ownership, or shim responsibilities before implementation when a module is becoming a catch-all or approaches approximately 600 LOC.

## 5. Verify real runtime compatibility

- [ ] 5.1 Run a minimal load smoke test against each supported OpenCode generation; verify the package is selected without consumer-side version branching.
- [ ] 5.2 Run capability conformance tests against actual OpenCode runtimes where practical; verify runtime behavior rather than compilation alone.
- [ ] 5.3 Integrate FOA as the first consumer without duplicating its business logic; verify the same FOA core exercises the supported capability contract on both generations.

## 6. Establish the capability extension workflow

- [ ] 6.1 Document the repeatable sequence for adding a capability: consumer requirement, source inspection, OpenSpec update, semantic tests, adapter implementation, and runtime verification.
- [ ] 6.2 Verify the workflow rejects speculative API additions that have no current consumer requirement.

## 7. Archive the initial specification

- [ ] 7.1 Reconcile any implementation discoveries back into the proposal, design, and capability spec; verify no unimplemented behavior is still claimed as supported.
- [ ] 7.2 Run strict OpenSpec validation and archive the completed change so `version-adaptation` becomes the current source-of-truth spec.
