# Design: Initialize OpenCode Version Adapter

## Context

See `proposal.md` for motivation and `specs/version-adaptation/spec.md` for the behavior contract.

The package is intended to remain a narrow OpenCode compatibility layer. OpenCode generation APIs may differ in loader shape, hooks, context objects, lifecycle behavior, events, and registration mechanisms. The initial capability inventory is derived from FOA, demand-runtime, opencode-agents-feed, and opencode-skill-usage. Consumer-specific hierarchy, workspace behavior, event interpretation, telemetry, prompts, and orchestration remain outside this package.

Existing projects provide useful implementation evidence:

- `oh-my-opencode-slim` contains a working OpenCode v2 compatibility bridge whose generic pieces may be reused under its license after consumer-specific behavior is removed.
- `opencode-plugin-compat` may be reused where its contracts exactly match required behavior, but this package does not assume OCP can replace every generation adapter.


## Phase 0 Evidence Baseline

Phase 0 fixes the evidence set used to define the first capability boundary. These references are investigation inputs, not runtime dependencies of this package.

### Reference consumer snapshots

| Consumer | Snapshot | OpenCode-facing evidence |
| --- | --- | --- |
| Folder-Oriented Agents | Git `e4ba2b7ecceaf535b5ee30e5cb3e160385eefa7c` | `src/opencode/plugin.ts`, `compile-config.ts`, `resource-hooks.ts`, and `src/resource/inference-limiter.ts` |
| demand-runtime | Git `514fbff1db57504172c0f04d00b8ddce5cf5abe9` | `src/opencode/plugin.ts`, `workspace-adapter.ts`, and `schema.ts` |
| opencode-agents-feed | archive `feed.zip` SHA-256 `7303ad66cf2203bc8deb8f07526d1845966da19ec38e0de80ab2ea92dc56b00d`, package `0.2.0` | `src/server-core.js` and `src/adapters/opencode-v1.js` |
| opencode-skill-usage | Git `e70a6518838bd7e300d3c19f77d05ef74c3d52a2`, package `0.8.0` | `src/server-core.js` and `src/tui.js` |

The other supplied archive identities are retained for reproducibility: FOA SHA-256 `027d4bdad7d73544ac922a9bb7868a6c32b3153b92c6150574cccb1f3fda88e0`, demand-runtime SHA-256 `540095ccc2f2c3ae2930b934f8396ea017b4115af122f237b4a371de08709bcd`, and opencode-skill-usage SHA-256 `3d093d176826f9844166d8a74ec00d3121ba43e2f86d25d2e55aab9935cb87a7`.

### OpenCode and upstream baselines

The initial semantic comparison is pinned to these immutable release references:

- OpenCode v1: tag `v1.18.30`. The v1 loader, plugin hook implementation, LLM request preparation, tool execution, permission evaluation, and task-depth enforcement were inspected at this tag.
- OpenCode v2: tag `v2.0.3`. This is the v2 baseline for the initial contract; later v2 builds are not implicitly covered. The Promise plugin context, server loader, session/model hooks, tool hooks, agent transforms, permission evaluation, config schema, and public TUI contract were inspected at this tag.
- `oh-my-opencode-slim`: tag `v2.2.19`, release commit `27d3658`, MIT license. Candidate bridge sources inspected include `src/v2/setup.ts`, `src/v2/client-shim.ts`, `src/v2/event-adapter.ts`, and `src/index.ts`.

Compatibility claims are tied to verified semantics, not only a major version label. A later OpenCode release must be revalidated before its behavior is treated as equivalent.

### Proven initial capability matrix

The capability names below describe semantic responsibilities discovered in Phase 0. Public exported names remain an implementation decision.

| Semantic requirement | Reference consumer(s) | OpenCode v1.18.30 | OpenCode v2.0.3 | Initial decision |
| --- | --- | --- | --- | --- |
| server plugin setup and disposal | FOA, feed, skill-usage | native: v1 server module plus `dispose` hook | native: v2 `setup` returns cleanup | shared lifecycle capability |
| host event delivery | FOA, feed, skill-usage | native: `event` hook receives host events | native: event subscription domain | shared delivery capability; consumer event ontology stays outside |
| blocking model-request gate | FOA | native: awaited `chat.params` during LLM request preparation | native: awaited `session.model.request` before transport request construction completes | separate shared capability |
| session agent/model observation | feed, skill-usage | native: `chat.params` carries session, agent, model | native: v2 session request/context hooks expose session, agent, and model | separate shared capability; do not merge with blocking gate |
| before-tool execution notification | FOA | native: awaited immediately before tool execution | native: awaited `tool.execute.before` | shared capability |
| successful tool-completion notification | skill-usage | native with filtering: ordinary tool paths call `tool.execute.after` after success, while the v1.18.30 Task path can also call it with `undefined` after a caught failure | native: `tool.execute.after` has explicit `completed` and `error` branches; adapter can select completed events without synthesizing timing | shared capability; v1 filters the Task failure branch and active agent is not part of the minimum promise |
| dynamic agent registration | FOA | native: config hook mutates `config.agent` | native: agent transform `update(id, ...)` creates a missing agent ID before applying the update | shared capability |
| ordered agent permission rules | FOA | native: ordered rules use last matching rule | native: ordered rules also use last matching rule | shared capability; representation conversion is generation-specific |
| global subagent-depth control | FOA | native: `config.subagent_depth`, enforced by task execution | unsupported: v2.0.3 canonical config and agent schemas contain no depth control exposed to plugins | shared capability with explicit v2 unsupported state |
| client application logging | FOA diagnostics | native: `client.app.log` | unsupported by the v2.0.3 Promise plugin context; `app` exposes metadata only | do not promote native application logging to a required shared capability; use the generation-independent optional adapter-diagnostic boundary for adapter-originated diagnostics and delegate to host logging only where verified |
| workspace adapter registration | demand-runtime | native: `experimental_workspace.register` | unsupported: v2.0.3 Promise plugin context exposes no workspace registration domain | separate capability, implemented only in the later workspace phase |
| external TUI runtime and UI/keymap/state/client surface | skill-usage | native for the v1 consumer runtime | not yet claimed: v2.0.3 exposes a materially different public TUI contract, but the external loading path and complete skill-usage semantic mapping are deferred to the TUI phase | separate TUI runtime boundary; no server-adapter claim |

No row marked unsupported may be converted into a warning-and-continue path when a consumer requires that behavior. Rows not yet claimed are not public support promises.

### Semantic findings that shape the contract

- `chat.params` is not one shared semantic capability. FOA uses it as an awaited inference gate, while feed and skill-usage use it to observe session/agent/model identity. Those responsibilities are split even if one native v1 hook implements both. Because observation describes an attempted identity at the adapter boundary rather than successful provider execution, the integrated v1 composition invokes observation before the blocking gate so a gate rejection cannot erase that observation.
- OpenCode v2.0.3 keeps those semantics separately addressable at the native API: `SessionModelRequest` includes `sessionID`, `agent`, and `model`, so the blocking gate maps directly to the awaited `session.hook("model.request")` boundary; the agent-loop `context` hook exposes the same stable identity and is used for passive session/agent/model observation. Each hook registration is independently disposable, so requiring one shared capability does not acquire the other.
- The event capability normalizes delivery ownership only. It does not convert OpenCode events into feed's `AgentEvent`; that mapping remains in opencode-agents-feed. The shared delivery callback receives an `AbortSignal`: v2 aborts it during disposal so cleanup can stop waiting on an in-flight consumer promise, while v1 supplies a non-aborted signal because the native hook invocation remains host-owned rather than adapter-pumped. Cancellation is cooperative for consumer work; the adapter can stop awaiting an ignored signal but cannot forcibly terminate arbitrary callback code.
- The minimum tool-completion capability does not promise an active agent. V1 does not provide one in `tool.execute.after`; skill-usage currently correlates session identity separately. V2 having an extra `agent` field does not justify silently strengthening the shared contract.
- OpenCode v1.18.30 has a Task-specific failure path that catches execution failure and still invokes `tool.execute.after` with an undefined result before recording the tool error. The v1 adapter therefore treats a missing after-hook result as non-success and does not emit shared successful completion.
- OpenCode v2.0.3 exposes tool interception through the Promise `tool.hook` domain. `execute.before` carries session/tool plus v2-only agent/message/call/input fields and awaits async callbacks; the shared before-tool mapping intentionally exposes only `sessionID`. `execute.after` is a discriminated `completed | error` event carrying the original `input`; the adapter emits shared successful completion only for `completed` and maps that `input` to the shared `args` field. The extra v2 agent/message/call/result/error fields remain generation-local. Each hook registration is independently disposable and is owned by the corresponding capability cleanup.
- FOA retains hierarchy compilation, collision policy, child allowlist policy, inference concurrency policy, prompts, and subagent-depth intent. The adapter owns only generation-specific registration and representation. Agent registration exposes existing host Agent identifiers as generation-independent context so FOA can keep collision policy without importing the native config shape; permission representation is kept out of the base Agent definition and mapped by the separate permission capability.
- Agent model selection is one cross-generation value: the canonical `provider/model` reference owns its optional variant. OpenCode v1.18.30 stores those as sibling `model` and `variant` Agent fields, while OpenCode v2.0.3 stores the variant inside `Agent.Info.model: Model.Ref`. The shared contract therefore does not represent a variant without a model; v2 does not emulate variant-only behavior by reimplementing model/provider resolution. OpenCode v2 Agent request-local `temperature`, `topP`, and provider-specific options map into `Agent.Info.request.settings`, while prompt maps to v2 `system`.
- Ordered Agent permission intent is represented as per-Agent ordered permission groups, with each permission namespace appearing at most once and containing ordered pattern/action rules. This matches the consumer-owned v1 config shape while remaining generation-independent. OpenCode v1.18.30 preserves config property order, `Permission.fromConfig()` expands that order with `Object.entries()`, and runtime evaluation uses the last matching rule; the v1 adapter therefore maps group and pattern insertion order directly instead of evaluating permission policy itself. A singleton `*` rule may use v1's equivalent action shorthand. Permission mapping applies only to Agents already present in the registration plan so it cannot silently create an Agent.
- OpenCode v2.0.3 represents permissions directly as an ordered `Permission.Ruleset` of `{ action, resource, effect }` entries and evaluates the last matching rule. The v2 adapter therefore flattens each shared permission group in group/rule order (`permission -> action`, `pattern -> resource`, shared action -> `effect`) without evaluating policy itself. Agent transforms already contain host-owned default rules, so consumer rules are appended after those defaults rather than replacing them. Because v2 `State` replays Agent transforms in registration order and the permission transform must not create a missing Agent, the v2 composition boundary installs `agent-registration` before `agent-permission-rules` whenever both are required, regardless of consumer request order; permission-only setup may still target Agents already provided by the host.
- The shared subagent-depth value is a consumer-owned minimum, not a hierarchy model. OpenCode v1.18.30 reads global `config.subagent_depth`, defaults it to `1` during Task execution, and rejects a Task when current Session ancestry depth is greater than or equal to that value. The v1 mapping therefore applies `max(existing ?? 1, minimumDepth)` and leaves ancestry traversal and enforcement inside OpenCode. Agent registration, permission mapping, and depth mapping share one v1 mutable `config` hook, so they operate on one staged draft and commit only after every participating mapping succeeds; a later mapping failure cannot leave a partial FOA plan in host config.
- demand-runtime retains all workspace creation/removal/recovery/path semantics. The adapter may own only host workspace registration and lifecycle translation. OpenCode v1.18.30 implements `experimental_workspace.register` as a project-scoped registry write with no unregister API; the v1 adapter must therefore commit workspace registration only after rollback-capable setup has succeeded and must not fabricate disposal behavior.
- TUI registration remains independent of server plugin registration. A public v2 TUI type surface is not sufficient evidence that the skill-usage TUI is compatible.

### Loader findings

OpenCode v1.18.30's server loader resolves the v1 module shape and invokes `server(input)`. OpenCode v2.0.3 resolves a server entrypoint and requires a default definition containing `id` plus `setup` or `effect`. The v2 host resolver also recognizes distinct `server`, `tui`, and `rpc` package entrypoints.

A combined default object containing both v1 and v2 members may be a viable packaging technique because each loader examines a different required member set, but Phase 0 does not make that shape a permanent specification. The actual package export strategy must be proven against both pinned runtimes before it becomes part of the public contract. Consumer business logic must not perform generation selection regardless of the packaging mechanism chosen.

### Phase 4 source-level loader integration

Before runtime smoke testing, the pinned loader implementations were re-read to establish one concrete candidate module shape. OpenCode v1.18.30 `readV1Plugin()` reads the default-exported object, selects its `server` function for the server path, and does not reject unrelated extra members. OpenCode v2.0.3 `PluginModule` decodes the default export as a definition with `id` plus `setup` or `effect`; the same `{ id, server, setup }` shape is independently exercised by the inspected `oh-my-opencode-slim` v2.2.19 compatibility package against the v2.0.3 baseline.

The repository therefore contains an internal candidate server-module factory that emits one `{ id, server, setup }` object from generation-independent capability bindings. The consumer does not branch on generation: the v1 loader selects `server`, while the v2 loader selects `id` and `setup`. This candidate remains private until Task 5.1 runs the package through both pinned OpenCode runtimes; source-shaped loader tests are preparation for that runtime proof, not a substitute for it.

The same preparation adds one integrated v1 server composition boundary. It combines the v1 shared native hooks (`chat.params` and `config`) from their independent semantic handlers, keeps Workspace registration as the final irreversible setup step, and preflights missing required mappings before any host mutation. This makes the v1 side symmetrical with the already-integrated v2 adapter without moving consumer policy into the compatibility layer.

### `opencode-plugin-compat` v1 reuse evaluation

`opencode-plugin-compat` (OCP) was re-evaluated against the implemented OpenCode v1 baseline using its published `0.4.0` source. No OCP production dependency is adopted for the initial v1 adapter.

The evaluated generic surfaces do not replace the semantic mappings required here:

- `packages/adapter/src/index.ts` is primarily a host-profile/facade bridge. Its classic `normalizeHooks()` path reports host gaps and returns the hook object unchanged; it does not split `chat.params` into the two shared capabilities, filter the v1 Task failure-shaped `tool.execute.after`, stage config mutations transactionally, preserve ordered Agent permission intent, merge `subagent_depth`, or sequence irreversible workspace registration.
- `packages/facade-plugin/src/types.ts` provides portable structural classic-plugin types and explicitly describes them as aligned with `@opencode-ai/plugin@1.18.3`, with intentionally loose SDK entity shapes. Those types are useful compatibility evidence, but they are not a substitute for this package's verified OpenCode `v1.18.30` semantic contract.
- OCP's workspace types structurally resemble the required v1 workspace surface, but importing OCP only for those types would add a compatibility dependency without removing any semantic adapter responsibility.
- `@opencode-compat/adapter` itself pulls the profile and Promise-v2 host kit, while `@opencode-compat/facade-plugin` additionally pulls the adapter, facade SDK, Promise-v2 host kit, profile, and Zod. None of those runtime dependencies are required by the current v1 mappings.

The initial v1 adapter therefore keeps its local narrow mappings and adds no OCP dependency. OCP remains a candidate only if a future concrete capability needs its host-profile/facade/provider behavior with matching semantics; such adoption still requires specification-first review rather than dependency-wide API coverage.

### `oh-my-opencode-slim` reuse classification

The upstream v2 bridge is evidence, not a module to copy wholesale. At `v2.2.19` the inspected files are already responsibility-heavy (`setup.ts` is about 1,249 lines, `client-shim.ts` about 474, `event-adapter.ts` about 410, and `index.ts` about 1,509), so reproducing that layout would violate this package's responsibility guardrails.

Potentially generic mechanisms that may be adapted only when required are:

- v2 setup/cleanup ownership
- narrow v1-shaped client operations required by a proven consumer
- agent transformation mechanics
- tool-hook bridging
- event subscription wiring
- session-hook bridging needed by an approved semantic capability

Application-specific command markers, interview behavior, background-job/orchestrator policy, prompt mutation, model fallback, delegation policy, MCP policy, and other oh-my-opencode-slim behavior remain excluded. Any copied or substantially adapted block must record its exact upstream source path and `27d3658` provenance and retain the MIT notice as required.

### Phase 3 v2 bridge re-review

Before starting the local v2 adapter, `oh-my-opencode-slim` `v2.2.19` / `27d3658` was re-reviewed at `src/v2/setup.ts`, `src/v2/client-shim.ts`, `src/v2/event-adapter.ts`, `src/index.ts`, and `LICENSE`. The repository is MIT licensed.

The local adapter may reuse these generic architectural ideas only when a concrete capability needs them:

- one v2 `setup` boundary that owns registrations and returns one cleanup owner
- registration handles whose `dispose()` operations are collected by setup
- one small bridge per host domain rather than consumer-side generation branching
- explicit structural host-context checks before a domain is used

The first v2 mappings keep lifecycle and event delivery separate. The server definition maps one generation adapter setup to the v2 `{ id, setup }` boundary and returns the adapter handle as the host-owned cleanup. Host events are consumed from the v2 event subscription stream and delivered opaquely; stopping the subscription belongs to adapter cleanup, while consumer-specific event interpretation remains outside the package.

The following upstream behavior remains application-specific and is not part of the reusable adapter boundary:

- reconstructing a broad v1 `PluginInput` client shim
- translating the complete v1 hook surface into v2
- command-marker and interview emulation
- delegation/tool-name rewriting and background-job policy
- prompt/cache mutation, model fallback, MCP policy, orchestration, and scheduler behavior
- consumer-specific event ontology conversion

The Phase 3 composition skeleton is independently implemented from this package's existing shared lifecycle contract and does not copy or substantially adapt upstream source code. Therefore no upstream source block or license notice is embedded in production code at this step. If a later capability substantially adapts an upstream block, that capability module must record the exact source path and `27d3658` provenance and retain the required MIT notice.

At completion of the initial v2 server mappings, the generation records one explicit support map for the approved capability inventory: eight capabilities are native, while `subagent-depth` and `workspace-registration` are unsupported at the pinned v2.0.3 baseline. Unsupported capabilities have no no-op mapping. Required-capability preflight rejects them before any supported mapping can acquire a host resource. This classification follows the v2.0.3 Promise plugin `Context`, which exposes no workspace registration domain, and the pinned v2 config/Agent schemas, which expose no plugin-controllable global subagent-depth field.

The v2 capability implementation remains split by semantic responsibility after the initial mapping set. `adapter.ts` remains composition/lifecycle only and the largest detailed capability module is `agent-registration.ts`; no v2 production module approaches the approximately 600 LOC responsibility guardrail.

After the individual mappings are complete, `integrated-adapter.ts` is the single v2 composition factory for the approved supported set. It accepts only generation-independent semantic bindings, assembles the corresponding capability modules, and uses the fixed v2.0.3 support map. It does not add consumer policy, expose the full Promise-plugin `Context`, or create no-op mappings for unsupported capabilities. A supported capability that a consumer requires but does not bind is treated as adapter initialization failure. The generation adapter preflights the presence of every required mapping before any mapping is installed, so a missing binding cannot leave earlier host hooks, subscriptions, or transforms temporarily active. Detailed mapping semantics remain owned by the capability modules and their focused tests.

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

The four Phase 0 reference consumers establish the initial capability inventory. Later personal plugins may add capabilities when they actually use them.

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

### Decision: Normalize lifecycle ownership without hiding native differences

Each generation adapter will expose one setup-to-dispose ownership boundary for adapter-owned releasable resources. Capability modules may return individual cleanup actions, but the generation adapter owns teardown ordering. Failed partial setup must roll back resources acquired by that setup attempt, and disposal must be safe to request more than once. If a host exposes an irreversible registration with no unregister operation, the adapter must treat it as a final commit step rather than inventing cleanup semantics.

Alternative considered: expose each generation's native lifecycle directly to consumers.

Rejected because it would make lifecycle handling a consumer responsibility and would reintroduce version-specific branching outside the adapter boundary.

### Decision: Stabilize error categories at the adapter boundary

Consumers will distinguish unsupported capability, initialization failure, and invalid host context without depending on native OpenCode exception classes. Generation-specific failures may remain attached as diagnostic causes.

Alternative considered: forward raw OpenCode errors unchanged.

Rejected because consumers would then depend on version-specific error types and messages that this package is intended to isolate.

### Decision: Keep adapter diagnostics optional and generation-independent

Adapter operating conditions may be surfaced through an optional structured diagnostic reporter supplied at the adapter boundary. The reporter is part of the public compatibility contract but is not a `CapabilityId`: diagnostics describe the adapter's own operation and must not make host feature support appear stronger or weaker than it is.

The minimum diagnostic shape carries `severity`, a stable `code`, a human-readable `message`, and optional generation-independent context such as the related `CapabilityId`. `warning` represents a recoverable condition for which the specified operation continues. `error` represents a concrete adapter operating failure where an owned subsystem or delivery path has stopped and the condition should be surfaced immediately even when its original failure is also preserved for lifecycle cleanup. General-purpose application logging remains outside the shared capability inventory.

Integrated boundaries SHOULD map adapter diagnostics onto verified host-native structured logging where that mapping exists. For the pinned evidence baseline, OpenCode v1.18.30 can use `client.app.log`; OpenCode v2.0.3's Promise plugin context does not provide an equivalent host-logging operation, so v2 must remain usable with an externally supplied reporter or with no reporter. The shared contract never exposes the native logger type.

Diagnostic delivery is best-effort. No reporter means no diagnostic side effect, and the adapter does not fall back to `console`. Reporter success or failure MUST NOT change the control-flow semantics of the condition being reported: warning delivery cannot turn a recoverable condition into failure, and error delivery cannot replace, suppress, or otherwise alter the underlying failure or lifecycle semantics.

Alternative considered: make OpenCode client logging itself a shared required capability.

Rejected because the pinned generations do not expose equivalent plugin-context logging semantics and the immediate requirement is adapter diagnostics, not a version-independent application logging service.

### Decision: Treat required capabilities as a set before setup ordering

`requiredCapabilities` is represented as an ordered readonly array for a small, dependency-aware setup sequence, but its semantic meaning is a set of required capabilities. Combining independent feature groups can naturally repeat the same requirement, so duplicate ids are not treated as malformed input.

Before support validation, dependency ordering, and installation, generation adapters normalize the sequence to first-occurrence order. Each distinct required capability is therefore validated and installed once. If one or more duplicates were removed, the adapter emits one `duplicate-required-capability` warning per duplicated capability when a diagnostic reporter is available; otherwise normalization remains silent.

Alternative considered: reject duplicate capability ids as adapter initialization errors.

Rejected because duplicate declarations can arise from ordinary composition of independent consumer feature sets and do not represent an ambiguous semantic requirement.

### Decision: Keep internal modules non-public by default

The package root is the normal consumer boundary. Internal helpers, generation adapters, and capability implementations are not public API merely because they exist as source modules. Version-specific exports are added only when a real testing, debugging, or consumer requirement justifies them.

Alternative considered: expose adapter internals early for flexibility.

Rejected because consumers would acquire dependencies on implementation structure and make later responsibility splitting or adapter replacement unnecessarily breaking.

Repository-internal generation tests are intentionally different from consumer imports. Tests under `tests/v1/` and `tests/v2/` MAY import the corresponding generation adapter and capability implementation paths directly when validating generation-specific mapping semantics. Those white-box imports do not make the referenced modules public API. Shared contract tests under `tests/contract/` MUST remain generation-independent.

#### Phase 1 public contract boundary

The initial package-root surface is limited to the evidence-backed capability identifiers, capability support states, required-capability validation, and the stable adapter error family. The root exports `CAPABILITIES`, `CapabilityId`, `RequiredCapabilities`, `CAPABILITY_SUPPORT`, `CapabilitySupport`, `CapabilitySupportMap`, `assertRequiredCapabilitiesSupported`, `ADAPTER_ERROR_CATEGORY`, `AdapterErrorCategory`, `VersionAdapterError`, `UnsupportedCapabilityError`, `AdapterInitializationError`, and `InvalidHostContextError`. `contract/` remains an implementation path rather than an additional documented consumer import path. No generation adapter, capability implementation module, client shim, TUI surface, or consumer-specific type is exported in Phase 1.

This later specification update deliberately extends the package-root contract with the minimal generation-independent diagnostic types needed to supply an optional reporter. Exact exported identifiers remain an implementation choice, but the public surface MUST expose the structured diagnostic value and reporter type without exposing OpenCode-native logger types.

The repository did not establish a package manager or build/test toolchain before Phase 1. Phase 1 therefore does not add package-manager metadata or select a build system merely to host the contract. Tooling configuration remains a separate decision; the contract stays ordinary TypeScript with no runtime dependency on OpenCode or third-party packages.

### Decision: Track upstream-derived bridge code explicitly

When generic compatibility logic is adapted from upstream code, the implementation will retain required notices and record source provenance sufficient to identify the upstream project and revision. Upstream updates are reviewed and adopted deliberately rather than synchronized automatically.

Alternative considered: periodically replace local bridge code with the latest upstream implementation.

Rejected because upstream application-specific assumptions or semantic changes could silently alter this package's compatibility contract.

### Decision: Extend capabilities through a specification-first workflow

A concrete consumer requirement starts capability expansion. The relevant OpenCode APIs are inspected, observable semantics are written into OpenSpec, tests are defined, and only then is production mapping added.

Alternative considered: implement a discovered API first and document it afterward.

Rejected because implementation-first growth encourages accidental API mirroring and makes the code, rather than the intended consumer behavior, become the specification.

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
│  ├─ diagnostics.ts            # create when implementing the specified optional reporter
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

The exact public shape is intentionally deferred until the approved Phase 0 semantics are converted into the minimal Phase 1 contract.

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

Implementation will proceed incrementally from the OpenSpec tasks. Server capability work precedes workspace and TUI work. Consumer repositories migrate only after the relevant shared capabilities are implemented and verified on the pinned OpenCode runtimes.
