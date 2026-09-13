# Tasks

## 1. Establish the initial capability inventory

- [ ] 1.1 Trace FOA's current OpenCode integration and record every actually used host capability; verify the inventory against the current FOA source rather than inferred API names.
- [ ] 1.2 Trace the corresponding behavior in the supported OpenCode v1 and v2 sources; verify each mapping includes execution timing, lifecycle, payload, cleanup, and error semantics.
- [ ] 1.3 Update `specs/version-adaptation/spec.md` with only the concrete capabilities proven necessary by 1.1 and 1.2; verify `openspec validate initialize-opencode-version-adapter --type change --strict` succeeds.

## 2. Define the minimum shared contract

- [ ] 2.1 Define the smallest shared types required by the approved capability set; verify no unused OpenCode API surface is exposed.
- [ ] 2.2 Define explicit native, emulated, and unsupported support metadata for each implemented capability; verify required unsupported capabilities are representable before adapter setup.
- [ ] 2.3 Add contract tests for the shared observable semantics; verify the same suite can be run against each adapter that claims support.

## 3. Establish the OpenCode v1 baseline

- [ ] 3.1 Implement only the v1 mappings required by the approved capability set; verify existing FOA behavior remains unchanged in v1-focused tests.
- [ ] 3.2 Evaluate `opencode-plugin-compat` only for required v1 behavior and use it only where its semantics match; verify no dependency is added solely for unused API coverage.

## 4. Implement the OpenCode v2 adapter

- [ ] 4.1 Review the current `oh-my-opencode-slim` v2 bridge and identify generic versus application-specific components; verify reused code is license-compatible and attribution requirements are recorded.
- [ ] 4.2 Implement only the generic v2 mappings required by the approved capability set; verify no oh-my-opencode-slim-specific orchestration, background jobs, prompts, or policy is included.
- [ ] 4.3 Add v2 adapter tests for each claimed native or emulated capability; verify unsupported required capabilities fail explicitly.

## 5. Verify real runtime compatibility

- [ ] 5.1 Run a minimal load smoke test against each supported OpenCode generation; verify the package is selected without consumer-side version branching.
- [ ] 5.2 Run capability conformance tests against actual OpenCode runtimes where practical; verify runtime behavior rather than compilation alone.
- [ ] 5.3 Integrate FOA as the first consumer without duplicating its business logic; verify the same FOA core exercises the supported capability contract on both generations.

## 6. Archive the initial specification

- [ ] 6.1 Reconcile any implementation discoveries back into the proposal, design, and capability spec; verify no unimplemented behavior is still claimed as supported.
- [ ] 6.2 Run strict OpenSpec validation and archive the completed change so `version-adaptation` becomes the current source-of-truth spec.
