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

## Target File Structure

The implementation is organized by OpenCode generation first, then by capability inside each generation. This keeps version-specific APIs physically isolated while preventing a single generation adapter from becoming a catch-all module.

The following is the target structure, not a requirement to create empty files preemptively:

```text
src/
├─ index.ts
├─ define-plugin.ts
│
├─ contract/
│  ├─ plugin.ts
│  ├─ capabilities.ts
│  ├─ errors.ts
│  └─ lifecycle.ts              # create only when required
│
├─ adapters/
│  ├─ v1/
│  │  ├─ index.ts
│  │  ├─ adapter.ts
│  │  ├─ client-shim.ts         # create only when required
│  │  └─ capabilities/
│  │     └─ <capability>.ts     # one semantic capability per module
│  │
│  └─ v2/
│     ├─ index.ts
│     ├─ adapter.ts
│     ├─ client-shim.ts         # create only when required
│     └─ capabilities/
│        └─ <capability>.ts
│
└─ internal/
   ├─ capability-support.ts     # create only when shared runtime support data is required
   └─ cleanup-stack.ts          # create only when multiple owned cleanup actions exist

tests/
├─ contract/
├─ v1/
├─ v2/
└─ fixtures/
```

Rules for creating files:

- `index.ts` files expose or assemble modules; they do not contain compatibility behavior.
- `adapter.ts` files coordinate setup and cleanup for one OpenCode generation; they do not own detailed capability conversion logic.
- `capabilities/<name>.ts` owns the mapping for one shared semantic capability on one OpenCode generation.
- `client-shim.ts` exists only when a real consumer requires client behavior that cannot be expressed by capability modules alone.
- Shared files are introduced only after more than one generation genuinely needs the same semantic contract.
- Empty capability placeholders are not created for APIs that no consumer uses.

### Dependency Direction

Imports MUST follow this direction:

```text
consumer
   ↓
public API
   ↓
contract
   ↑
   └──── adapters/v1
   └──── adapters/v2
             ↓
          internal
```

More precisely:

- `contract/` MUST NOT import from `adapters/`.
- `adapters/v1/` MUST NOT import from `adapters/v2/`, and vice versa.
- Capability modules SHOULD NOT call sibling capability modules directly; `adapter.ts` composes them.
- `internal/` MAY provide generation-neutral utilities but MUST NOT contain consumer-specific policy.
- Consumer packages MUST use the public API rather than importing adapter internals.

These boundaries are intended to make deletion of an obsolete generation a directory-level change rather than a cross-cutting refactor.

## Component and Class Structure

The implementation SHOULD prefer interfaces, immutable data, and small factory functions over inheritance-heavy class hierarchies. A class is justified only when it owns lifecycle state or resources.

The following roles define the intended responsibility boundaries. Exact exported names remain implementation decisions until the public API is approved.

### VersionAdapter

`VersionAdapter` is the generation-level composition boundary.

Responsibilities:

- identify the OpenCode generation it handles
- expose support state for implemented shared capabilities
- install only the capability adapters required by the consumer definition
- own generation-level setup and teardown ordering

It MUST NOT:

- contain consumer business logic
- implement detailed agent/tool/session/event conversion inline
- contain behavior for another OpenCode generation
- become a registry of every historical OpenCode API

Conceptually:

```ts
interface VersionAdapter {
  readonly generation: OpenCodeGeneration
  readonly capabilities: CapabilitySupportMap
  setup(input: AdapterSetupInput): MaybePromise<AdapterHandle>
}
```

### Capability Adapter

A capability adapter maps one shared semantic capability to one OpenCode generation.

Examples may eventually include:

```text
agent
permission
tool-before
event
lifecycle
```

Only capabilities required by real consumers are created.

A capability adapter owns:

- generation-specific API calls for that capability
- payload normalization required by that capability
- support classification: native, emulated, or unsupported
- capability-specific cleanup when applicable

It MUST NOT own unrelated capability mappings.

Conceptually:

```ts
interface CapabilityAdapter {
  readonly capability: CapabilityId
  readonly support: CapabilitySupport
  install(context: AdapterContext): MaybePromise<Cleanup | void>
}
```

This interface MAY remain internal and MAY be replaced by equivalent factory functions if that produces less code.

### AdapterHandle / Cleanup Owner

A setup operation that acquires subscriptions, hooks, or other resources MUST return or retain one explicit cleanup owner.

Conceptually:

```ts
interface AdapterHandle {
  dispose(): MaybePromise<void>
}
```

Individual capability modules may return cleanup callbacks, but generation-level teardown ordering belongs to the generation adapter rather than to the consumer.

A shared `CleanupStack` utility SHOULD be introduced only if more than one capability actually requires coordinated cleanup.

### Client Shim

A client shim is a version-specific compatibility utility, not a general service class.

It MAY translate client operations needed by existing plugin code when the target OpenCode generation exposes a structurally different API.

It MUST NOT:

- contain orchestration policy
- rewrite plugin-specific prompts
- implement plugin-specific fallback behavior
- become a second OpenCode SDK

If shim responsibilities separate into unrelated domains, the shim MUST be split before adding more behavior.

### Plugin Definition

The plugin definition represents consumer-declared behavior that is independent of OpenCode generation selection.

It contains only capabilities actually consumed by the plugin.

The definition MUST NOT require consumers to provide independent v1 and v2 business implementations for equivalent behavior.

The exact public shape is intentionally deferred until FOA's real integration surface has been traced.

## Responsibility Concentration Guardrails

The architecture MUST be reviewed before adding a capability when any of the following becomes true:

- a generation `adapter.ts` begins performing detailed payload conversion rather than composition
- one module owns more than one unrelated capability
- a client shim starts containing consumer policy or lifecycle orchestration
- a shared contract starts importing version-specific OpenCode types
- v1 and v2 modules begin importing each other
- adding a new generation requires editing existing generation-specific modules
- a source file approaches approximately 600 LOC

When one of these conditions occurs, responsibility separation takes priority over adding the new feature.

Preferred refactoring order:

```text
1. extract the capability-specific mapping
2. isolate lifecycle/resource ownership
3. isolate version-specific shim behavior
4. keep adapter.ts as composition only
5. add the requested capability
```

Generic names such as `Manager`, `Service`, `Utils`, or `Compat` SHOULD NOT be used as dumping grounds for unrelated behavior. A module or class name should identify the single responsibility it owns.

## Extension Pattern

Adding a new capability SHOULD normally touch only:

```text
contract/<relevant-contract>.ts
adapters/v1/capabilities/<capability>.ts   # if relevant
adapters/v2/capabilities/<capability>.ts   # if relevant
tests/contract/<capability>.test.ts
tests/v1/<capability>.test.ts
tests/v2/<capability>.test.ts
```

Adding a future OpenCode generation SHOULD normally create:

```text
adapters/v3/
├─ index.ts
├─ adapter.ts
└─ capabilities/
```

Existing v1/v2 capability modules SHOULD NOT require modification solely because v3 is added.

This locality is an architectural acceptance criterion, not merely a preferred directory layout.

## Risks / Trade-offs

- [OpenCode APIs continue changing] -> Keep version-specific code isolated and verify real runtime behavior before declaring capability support.
- [Upstream bridge code contains application-specific assumptions] -> Extract only generic behavior and add independent conformance tests before reuse.
- [Shared API becomes a renamed copy of one OpenCode generation] -> Require evidence from multiple relevant generations before promoting behavior into the shared contract.
- [Compatibility layer grows too large] -> Implement only consumer-required capabilities and evaluate responsibility splitting before modules approach approximately 600 LOC.
- [Old generation support becomes maintenance-only] -> Keep adapters removable so dropping an obsolete generation does not require rewriting consumers.

## Migration Plan

This is a new package, so there is no production migration yet.

Implementation will proceed incrementally from the OpenSpec tasks. FOA will migrate only after the shared capabilities it requires are implemented and verified on the relevant OpenCode generations.
