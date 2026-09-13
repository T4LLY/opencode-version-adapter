# Design: Initialize OpenCode Version Adapter

## Context

See `proposal.md` for motivation and `specs/version-adaptation/spec.md` for the behavior contract.

The package is intended to remain a narrow OpenCode compatibility layer. OpenCode generation APIs may differ in loader shape, hooks, context objects, lifecycle behavior, events, and registration mechanisms. The initial consumer is FOA, but FOA-specific hierarchy, permission policy, inference policy, prompts, and orchestration remain outside this package.

Existing projects provide useful implementation evidence:

- `oh-my-opencode-slim` contains a working OpenCode v2 compatibility bridge whose generic pieces may be reused under its license after consumer-specific behavior is removed.
- `opencode-plugin-compat` may be reused where its contracts exactly match required behavior, but this package does not assume OCP can replace every generation adapter.

## Goals / Non-Goals

### Goals

- Keep generation-specific OpenCode integration isolated.
- Grow the shared API only from real consumer requirements.
- Make support status and failure behavior explicit per capability.
- Allow later OpenCode generations to be added without redesigning consumers.
- Keep the implementation small enough that adapters remain inspectable and replaceable.

### Non-Goals

- Full mirroring of every OpenCode plugin API.
- A universal coding-agent harness abstraction.
- Perfect emulation of APIs whose semantics cannot be preserved.
- Consumer-specific orchestration or policy.

## Decisions

### Decision: Use capability-driven compatibility instead of version-wide compatibility claims

Compatibility will be tracked per capability. A generation can support one capability while another remains unsupported.

Alternative considered: declare an entire OpenCode generation supported after the package loads successfully.

Rejected because loader compatibility does not prove hook timing, lifecycle, payload, or failure semantics.

### Decision: Add shared capabilities only when demanded by a real consumer

FOA will establish the initial capability set. Later personal plugins may add capabilities when they actually use them.

Alternative considered: mirror the entire OpenCode plugin API into a canonical API before implementation.

Rejected because it creates speculative abstraction, unnecessary maintenance, and a high risk of false semantic equivalence.

### Decision: Keep one isolated integration boundary per OpenCode generation

Generation-specific APIs will be contained behind adapter modules. Shared consumer contracts will not import generation-specific API types unless a future capability explicitly requires an escape hatch.

Alternative considered: one large compatibility module with version conditionals.

Rejected because removal or addition of a generation would become cross-cutting and harder to verify.

### Decision: Reuse proven upstream bridge code selectively

Generic compatibility mechanisms from `oh-my-opencode-slim` may be extracted for OpenCode v2 when their semantics match. `opencode-plugin-compat` may be used for matching capabilities instead of duplicating proven behavior.

Upstream consumer-specific behavior will not enter the shared adapter package.

Alternative considered: rewrite every bridge mechanism from scratch.

Rejected because it discards already exercised compatibility behavior without improving the package boundary.

### Decision: Fail closed for required unsupported capabilities

A consumer declaring a capability as required must receive an explicit setup failure when the active generation cannot provide it safely.

Alternative considered: log a warning and continue.

Rejected because partially active plugins can appear healthy while silently losing required behavior.

### Decision: Keep future multi-harness support outside this package

If a future harness adapter is created, it will compose this package for OpenCode support rather than expanding this package into a universal abstraction.

## Risks / Trade-offs

- [OpenCode APIs continue changing] -> Keep version-specific code isolated and verify real runtime behavior before declaring capability support.
- [Upstream bridge code contains application-specific assumptions] -> Extract only generic behavior and add independent conformance tests before reuse.
- [Shared API becomes a renamed copy of one OpenCode generation] -> Require evidence from multiple relevant generations before promoting behavior into the shared contract.
- [Compatibility layer grows too large] -> Implement only consumer-required capabilities and evaluate responsibility splitting before modules approach approximately 600 LOC.
- [Old generation support becomes maintenance-only] -> Keep adapters removable so dropping an obsolete generation does not require rewriting consumers.

## Migration Plan

This is a new package, so there is no production migration yet.

Implementation will proceed incrementally from the OpenSpec tasks. FOA will migrate only after the shared capabilities it requires are implemented and verified on the relevant OpenCode generations.
