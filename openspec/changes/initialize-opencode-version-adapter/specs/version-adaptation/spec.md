## Purpose

Provide consumer plugins with a stable OpenCode compatibility boundary that exposes only required cross-generation capabilities while preserving meaningful behavioral differences between OpenCode plugin API generations.

## ADDED Requirements

### Requirement: Consumer logic is independent of OpenCode generation

The adapter MUST allow a supported consumer capability to be used without requiring the consumer's business logic to select or branch on an OpenCode API generation.

#### Scenario: Same consumer behavior targets multiple generations

- **WHEN** a consumer uses a capability supported by more than one OpenCode generation
- **THEN** the consumer uses the same shared capability contract for those generations
- **AND** generation-specific integration remains outside the consumer's business logic

### Requirement: Capability scope is driven by real usage

The adapter MUST add shared capabilities only when they are required by an actual consumer plugin and have defined behavior for the supported OpenCode generations relevant to that consumer.

#### Scenario: Unused OpenCode API exists

- **WHEN** OpenCode exposes an API that no current consumer requires
- **THEN** the adapter does not need to expose or implement that API

#### Scenario: Consumer requires a new capability

- **WHEN** a consumer requires an OpenCode API capability that is not yet represented
- **THEN** the capability's semantics are evaluated across the relevant supported OpenCode generations before the shared contract is extended

### Requirement: Capability support state is explicit

The adapter MUST distinguish whether an implemented capability is native, safely emulated, or unsupported for each relevant OpenCode generation.

#### Scenario: Native equivalent exists

- **WHEN** an OpenCode generation provides behavior equivalent to the shared capability
- **THEN** the capability may be classified as native for that generation

#### Scenario: Safe equivalent behavior can be reproduced

- **WHEN** an OpenCode generation lacks a direct equivalent API but equivalent observable behavior can be reproduced safely
- **THEN** the capability may be classified as emulated for that generation

#### Scenario: Equivalent behavior cannot be provided safely

- **WHEN** a required capability cannot be provided with equivalent observable behavior on the active OpenCode generation
- **THEN** the capability is classified as unsupported
- **AND** adapter setup fails explicitly for a consumer that requires it

### Requirement: Semantic differences are not hidden

The adapter MUST NOT classify APIs as equivalent solely because their names or data shapes are similar.

#### Scenario: Similar APIs have different behavior

- **WHEN** two OpenCode generations expose APIs with different execution timing, lifecycle, payload meaning, cleanup behavior, or error semantics
- **THEN** the adapter preserves or explicitly accounts for those differences
- **AND** it does not claim shared compatibility until equivalent consumer-visible behavior is verified

### Requirement: Future OpenCode generations are isolated

The adapter MUST permit support for a later OpenCode plugin API generation to be added without requiring supported consumer business logic to be rewritten solely because the OpenCode generation changed.

#### Scenario: A new OpenCode generation is introduced

- **WHEN** support for a new OpenCode generation is added
- **THEN** generation-specific integration is added behind the compatibility boundary
- **AND** existing shared capability semantics remain unchanged unless an actual consumer requirement requires their revision

### Requirement: Scope remains OpenCode-specific

The adapter MUST provide compatibility only among OpenCode plugin API generations and MUST NOT require consumers to adopt abstractions for unrelated coding-agent harnesses.

#### Scenario: Multi-harness support is desired later

- **WHEN** a future package needs to support OpenCode together with other harnesses
- **THEN** that package may compose `opencode-version-adapter`
- **AND** multi-harness behavior is not added to this adapter solely for that purpose

### Requirement: Lifecycle ownership is explicit and reversible where the host permits reversal

The adapter MUST present a consistent setup-to-dispose lifecycle for adapter-owned hooks, subscriptions, and other releasable resources regardless of the native lifecycle shape of the active OpenCode generation. A generation-native registration that the host owns and exposes no unregister operation for MUST NOT be represented by a fabricated cleanup. Such an irreversible registration MUST be deferred until every rollback-capable setup step has succeeded so a failed setup attempt does not leave a partially active adapter behind.

#### Scenario: Setup succeeds

- **WHEN** adapter setup installs one or more adapter-owned releasable resources successfully
- **THEN** exactly one generation-level cleanup owner is responsible for releasing those resources
- **AND** consumer code does not need to know generation-specific teardown behavior

#### Scenario: Setup fails after partial installation

- **WHEN** adapter setup fails after one or more adapter-owned releasable resources have already been installed
- **THEN** the adapter releases resources installed by that failed setup attempt before surfacing the failure
- **AND** any generation-native irreversible registration has not yet been committed
- **AND** it does not leave a partially active adapter behind

#### Scenario: Host registration has no unregister operation

- **GIVEN** a generation exposes a registration operation without a matching unregister operation
- **WHEN** that registration participates in adapter setup
- **THEN** the adapter performs it only after all rollback-capable setup steps succeed
- **AND** successful registration lifetime remains owned by the host rather than by a fabricated adapter cleanup

#### Scenario: Cleanup is requested more than once

- **WHEN** the adapter cleanup operation is invoked more than once
- **THEN** subsequent cleanup requests do not repeat destructive teardown or fail solely because cleanup already completed

### Requirement: Adapter failures use stable error categories

The adapter MUST classify compatibility-boundary failures using stable adapter-level error categories rather than requiring consumers to interpret generation-specific OpenCode exceptions.

At minimum, the contract MUST distinguish:

- an unsupported required capability
- adapter initialization failure
- invalid or unrecognized host context

Exact exported error class names MAY be decided during implementation, but these semantic categories MUST remain distinguishable.

#### Scenario: OpenCode reports an initialization failure

- **WHEN** a generation-specific OpenCode operation fails while the adapter is initializing
- **THEN** the consumer receives an adapter initialization failure category
- **AND** the original failure MAY be retained as diagnostic cause information
- **AND** the consumer is not required to branch on a generation-specific OpenCode error type

#### Scenario: Host context cannot be recognized safely

- **WHEN** the adapter cannot establish that the received host context satisfies the requirements of a supported OpenCode generation
- **THEN** setup fails explicitly as an invalid host context
- **AND** the adapter does not guess a generation and continue

### Requirement: Adapter diagnostics are structured and optional

The adapter MUST provide a generation-independent way for consumers or integration boundaries to receive structured diagnostics for adapter operating conditions. Diagnostic reporting is advisory and MUST NOT itself become a required capability.

A diagnostic emitted by the adapter MUST include a severity, a stable machine-readable code, and a human-readable message. It MAY include the related capability identifier and other generation-independent context needed to identify the condition. The shared severity set MUST include `warning` for recoverable conditions where the specified operation continues and `error` for adapter operating failures where an owned subsystem or delivery path has stopped. Additional severities MUST NOT be added without a concrete consumer need.

The diagnostic reporter MUST be optional. When no reporter is provided, the adapter MUST preserve the same functional behavior without falling back to `console` output. Reporter success or failure MUST NOT change the specified control flow of the reported condition, including whether the adapter continues, stops an owned subsystem, preserves an error for disposal, or fails setup.

#### Scenario: Consumer supplies a diagnostic reporter

- **WHEN** the adapter encounters a condition for which this specification defines a diagnostic
- **THEN** the adapter reports the structured diagnostic through the supplied generation-independent reporter
- **AND** consumer code does not need to interpret an OpenCode-generation-specific logging type

#### Scenario: No diagnostic reporter is supplied

- **WHEN** the same diagnosed condition occurs and no reporter is available
- **THEN** the adapter continues with the specified functional behavior
- **AND** it does not write directly to `console` as an implicit fallback

#### Scenario: Adapter subsystem stops after an operating failure

- **WHEN** an owned adapter subsystem or delivery path stops because of an operating failure and this specification defines a diagnostic
- **THEN** the adapter reports an `error` diagnostic when a reporter is available
- **AND** diagnostic delivery does not replace, suppress, or alter the underlying failure or lifecycle semantics

#### Scenario: An integrated OpenCode generation exposes usable host logging

- **WHEN** an OpenCode integration boundary has a verified structured host-logging operation that can represent an adapter diagnostic
- **THEN** that boundary SHOULD delegate adapter diagnostics to the host logger
- **AND** the shared diagnostic contract remains independent of the native logging API
- **AND** absence of an equivalent host logger does not make the adapter capability unsupported

### Requirement: Required capability declarations have set semantics

`requiredCapabilities` MUST describe which semantic capabilities are required, not how many times they are installed. Repeated occurrences of the same capability identifier therefore MUST NOT cause repeated installation or repeated ownership of the same generation mapping.

The adapter MUST normalize duplicate required-capability identifiers before dependency ordering and capability installation while preserving the first occurrence order for otherwise independent capabilities. Duplicate declarations are recoverable input and MUST NOT fail setup solely because the same required capability was listed more than once.

When a duplicate is detected and a diagnostic reporter is available, the adapter MUST emit one warning diagnostic with stable code `duplicate-required-capability` for each duplicated capability identifier. The diagnostic MUST identify the duplicated capability.

#### Scenario: One capability is declared more than once

- **WHEN** `requiredCapabilities` contains the same capability identifier multiple times
- **THEN** support and mapping validation treat that identifier as one required capability
- **AND** its generation mapping is installed at most once
- **AND** dependency ordering is applied to the deduplicated capability sequence

#### Scenario: Duplicate declaration can be diagnosed

- **WHEN** a duplicated required capability is normalized and a diagnostic reporter is available
- **THEN** the reporter receives a `warning` diagnostic with code `duplicate-required-capability`
- **AND** the diagnostic identifies the duplicated capability
- **AND** setup continues if all distinct required capabilities are otherwise valid and supported

#### Scenario: Duplicate declaration has no reporter

- **WHEN** a duplicated required capability is normalized and no diagnostic reporter is available
- **THEN** setup still deduplicates and continues
- **AND** duplicate handling does not write directly to `console`

### Requirement: Public imports are intentionally bounded

Consumer plugins MUST depend only on documented public exports of `opencode-version-adapter`.

Internal modules and generation implementation details MUST remain replaceable without requiring consumer changes.

#### Scenario: Consumer uses the adapter normally

- **WHEN** a consumer imports the package for normal plugin integration
- **THEN** it uses the package root or another explicitly documented public export
- **AND** it does not need to import `internal/`, capability implementation modules, or generation adapter implementation files

#### Scenario: A version-specific export is proposed

- **WHEN** testing, debugging, or a real consumer requirement needs a version-specific export
- **THEN** that export is added deliberately to the documented public surface
- **AND** version-specific exports are not created preemptively for unused internals

#### Scenario: Repository-internal generation mapping is tested

- **WHEN** a test under `tests/v1/` or `tests/v2/` validates generation-specific adapter or capability behavior
- **THEN** that test MAY import the matching generation implementation path directly
- **AND** the white-box test import does not make that implementation path part of the documented consumer surface
- **AND** shared tests under `tests/contract/` remain independent of generation implementation paths

### Requirement: Reused upstream compatibility code remains traceable and generic

Code adapted from an upstream compatibility implementation MUST preserve applicable license and attribution requirements and MUST remain distinguishable from consumer-specific policy.

Upstream changes MUST be incorporated through explicit review rather than automatically replacing local compatibility behavior.

#### Scenario: Generic upstream bridge logic is reused

- **WHEN** code is adapted from a project such as `oh-my-opencode-slim`
- **THEN** required copyright and license notices are retained
- **AND** the implementation records enough source provenance to identify the upstream project and revision used
- **AND** application-specific orchestration, prompts, fallback policy, or other consumer behavior is excluded

#### Scenario: Upstream implementation changes later

- **WHEN** the upstream project changes the reused bridge implementation
- **THEN** this package does not automatically adopt the change
- **AND** the change is reviewed against this package's capability semantics and conformance tests before incorporation

### Requirement: Capability expansion is specification-first

A new shared capability MUST be specified before production implementation begins.

The specification update MUST be driven by a concrete consumer requirement and MUST record the relevant cross-generation semantics before adapters claim support.

#### Scenario: A consumer needs a previously unsupported API

- **WHEN** a real consumer requires a new OpenCode API capability
- **THEN** the current OpenCode implementations relevant to that consumer are inspected first
- **AND** the shared semantic requirement and per-generation support state are added to OpenSpec before production code is implemented
- **AND** tests are defined from the specified observable behavior

#### Scenario: An API is discovered without a consumer requirement

- **WHEN** investigation finds an additional OpenCode API that no current consumer uses
- **THEN** the shared contract is not expanded solely to mirror that API


### Requirement: Model request gating is distinct from identity observation

The adapter MUST represent a blocking model-request gate independently from passive session agent/model observation. A generation MAY implement both semantics through one native hook, but the shared contract MUST NOT require them to remain coupled. Passive observation records that a model request reached the adapter boundary with a stable session/agent/model identity; it does not assert that admission control succeeded or that provider execution occurred. When one native hook carries both semantics, observation MUST run before the blocking gate so a later gate rejection does not suppress that attempted identity.

#### Scenario: Consumer blocks a model request before provider execution

- **WHEN** a consumer requires admission control before an OpenCode model request proceeds
- **THEN** the model-request gate is awaited before the provider request is allowed to continue
- **AND** the gate receives enough stable identity to distinguish the session, agent, provider, and model required by the consumer

#### Scenario: Gate rejection does not erase attempted identity

- **WHEN** passive observation and the blocking model-request gate share one native hook and the gate rejects the request
- **THEN** the observation callback receives the stable request identity before the gate is invoked
- **AND** the original gate rejection still prevents the provider request from continuing
- **AND** the observation does not imply that provider execution occurred

#### Scenario: Consumer only observes session identity

- **WHEN** a consumer needs session-to-agent/model association without blocking model execution
- **THEN** it can use the observation capability without acquiring the semantics or lifecycle of the blocking gate

### Requirement: Host event delivery does not define consumer event meaning

The adapter MUST provide generation-independent ownership and delivery of host events required by consumers without defining a universal application event ontology.

For OpenCode v2, a failure from the subscribed event iterator or from the consumer delivery callback MUST stop that owned delivery pump. The original failure MUST remain owned by the delivery cleanup so disposal can surface it. When a diagnostic reporter is available, the adapter MUST also emit exactly one `error` diagnostic with stable code `host-event-delivery-failed` when the pump stops for that failure. Diagnostic reporting MUST NOT cause delivery to resume, replace the original failure, or change cleanup semantics.

Each host-event delivery invocation MUST receive an `AbortSignal` representing adapter cancellation of that in-flight delivery. For the OpenCode v2 owned delivery pump, disposal MUST abort that signal before waiting for pump completion and MUST NOT remain blocked solely on a consumer delivery promise after cancellation has been requested. A consumer SHOULD stop its in-flight work promptly when the signal is aborted; arbitrary consumer code cannot be forcibly terminated by the adapter. Cancellation initiated by normal disposal MUST NOT be reported as `host-event-delivery-failed`. OpenCode v1 has no adapter-owned event pump to cancel, so its host-owned event hook supplies a signal that remains non-aborted for the invocation.

#### Scenario: OpenCode v2 host-event delivery fails after setup

- **WHEN** the v2 event iterator or consumer delivery callback fails while the owned delivery pump is active
- **THEN** the pump stops and no later host events are delivered by that registration
- **AND** an available diagnostic reporter receives one `error` diagnostic with code `host-event-delivery-failed` identifying the host-event-delivery capability
- **AND** the original failure is still surfaced by owned cleanup

#### Scenario: OpenCode v2 is disposed while consumer delivery is still pending

- **WHEN** disposal begins while one host-event delivery callback is still pending
- **THEN** the callback's cancellation signal is aborted
- **AND** adapter cleanup does not wait indefinitely for that delivery promise to settle after cancellation
- **AND** the event iterator is still closed when its native `return()` operation is available
- **AND** normal disposal cancellation does not emit `host-event-delivery-failed`

#### Scenario: Feed consumes OpenCode events

- **WHEN** opencode-agents-feed receives events through the version adapter
- **THEN** OpenCode generation-specific subscription mechanics stop at the version-adapter boundary
- **AND** feed-specific conversion into `AgentEvent` remains owned by opencode-agents-feed
- **AND** the version adapter does not interpret feed-specific handoff, message, or tool semantics

### Requirement: Tool execution capabilities preserve observed timing

The initial tool capabilities MUST distinguish notification immediately before tool execution from successful tool-completion notification. They MUST NOT promise fields that are absent from a supported generation merely because another generation provides them.

#### Scenario: Before-tool callback is used as a release point

- **WHEN** a consumer registers a before-tool callback
- **THEN** the callback is awaited at the host execution point before the tool action begins

#### Scenario: Consumer observes successful tool completion

- **WHEN** a consumer registers the successful tool-completion capability
- **THEN** it is invoked only after successful host tool completion
- **AND** a generation whose native after-hook also reports errors MUST NOT surface an error branch as successful completion

#### Scenario: OpenCode v1 Task failure reaches the native after-hook without a result

- **GIVEN** OpenCode v1.18.30 catches a Task execution failure and invokes `tool.execute.after` with an undefined result before recording the tool error
- **WHEN** the v1 adapter receives that native after-hook call
- **THEN** it does not invoke the shared successful tool-completion callback
- **AND** the missing result is not reclassified as successful completion

#### Scenario: One generation exposes active agent on tool completion

- **WHEN** the active OpenCode generation includes an agent identifier in its native tool-completion payload but another supported generation does not
- **THEN** the minimum shared tool-completion contract does not claim that active agent identity is always available
- **AND** a consumer that requires correlation uses a separately specified identity capability

### Requirement: Agent registration does not absorb consumer policy

The initial agent capability MUST support registering the consumer-provided agent representation and preserving ordered permission intent without deciding consumer hierarchy or permission policy.

#### Scenario: FOA registers generated agents

- **WHEN** FOA supplies generated agent definitions
- **THEN** the generation adapter maps those definitions into the active OpenCode registration mechanism
- **AND** FOA remains responsible for hierarchy compilation, descriptions, prompts, collision decisions, child allowlists, and requested subagent depth

#### Scenario: Registration needs host Agent collision context

- **WHEN** the active generation exposes existing Agent identifiers at registration time
- **THEN** the adapter exposes those identifiers through generation-independent registration context
- **AND** the consumer decides whether a matching identifier is rejected, replaced, or otherwise handled
- **AND** the adapter does not silently invent a collision policy

#### Scenario: Registration and permission mapping remain separate

- **WHEN** a consumer registers an Agent and also supplies ordered permission intent
- **THEN** the base Agent registration representation contains only non-permission Agent fields
- **AND** ordered permission conversion remains owned by the separate agent-permission capability

#### Scenario: Agent variant is tied to an explicit model selection

- **WHEN** a consumer selects an Agent model variant through the shared registration contract
- **THEN** the variant is nested inside the explicit model selection rather than represented as an independent Agent field
- **AND** the shared contract cannot express a variant without also naming the model it modifies
- **AND** the v1 adapter expands that selection to native `model` plus `variant` fields while the v2 adapter maps it to one native `Model.Ref`

#### Scenario: Ordered child permission rules are mapped

- **WHEN** a consumer supplies ordered permission intent whose behavior depends on later matching rules overriding earlier matching rules
- **THEN** the adapter preserves that observable ordering on every generation that claims support
- **AND** representation changes such as a generation-specific action name do not change the allow/deny result

#### Scenario: Permission mapping does not create an Agent

- **WHEN** ordered permission intent targets an Agent that is not present in the generation registration plan
- **THEN** permission mapping fails before mutating host Agent configuration
- **AND** the permission capability does not create a placeholder Agent as a side effect

#### Scenario: V2 permission rules preserve native precedence

- **GIVEN** OpenCode v2 Agent state already contains host-owned permission rules
- **WHEN** the consumer requires both Agent registration and ordered Agent permission mapping
- **THEN** the v2 adapter installs Agent registration before permission mapping even if the required-capability list names permission mapping first
- **AND** shared permission groups are flattened into the native ordered ruleset without reordering
- **AND** consumer rules follow host-owned rules so native last-match evaluation preserves consumer override intent
- **AND** disposing the permission capability removes only its replayable transform rather than deleting host-owned rules

### Requirement: Subagent depth expresses a consumer-owned minimum

The shared subagent-depth capability MUST accept a consumer-owned minimum global nesting depth without requiring the consumer to know the active generation's config field or defaulting rules.

A generation that claims support MUST preserve a larger valid host-configured depth rather than lowering it. The adapter MUST NOT derive hierarchy depth or implement a separate Task scheduler.

#### Scenario: FOA requires deeper nesting than the v1 host config

- **GIVEN** FOA requires minimum depth `2`
- **AND** OpenCode v1 config currently has `subagent_depth: 1`
- **WHEN** the v1 subagent-depth mapping runs
- **THEN** the host config depth becomes `2`

#### Scenario: OpenCode v1 already allows deeper nesting

- **GIVEN** FOA requires minimum depth `2`
- **AND** OpenCode v1 config currently has `subagent_depth: 5`
- **WHEN** the v1 subagent-depth mapping runs
- **THEN** the host config depth remains `5`

#### Scenario: OpenCode v1 omits the depth field

- **GIVEN** OpenCode v1 config omits `subagent_depth`
- **AND** FOA requires minimum depth `0`
- **WHEN** the v1 subagent-depth mapping runs
- **THEN** the adapter preserves OpenCode v1.18.30's effective default depth of `1`

### Requirement: Shared host config mappings commit atomically

When multiple semantic capabilities share one generation-native mutable config hook, the generation adapter MUST stage their mapped changes and commit them only after every participating mapping succeeds.

#### Scenario: A later v1 config mapping fails

- **GIVEN** Agent registration and subagent-depth mappings have produced staged changes
- **WHEN** a later v1 config mapping fails before the shared config hook completes
- **THEN** neither the staged Agent map nor staged subagent depth is committed to the host config
- **AND** the consumer does not observe a partially installed compatibility plan

### Requirement: Initial support classifications are evidence-backed

For the Phase 0 OpenCode baselines, the adapter specification records the following support classifications for the approved semantic capabilities. These classifications MUST be revalidated before broader runtime versions are claimed.

| Capability | OpenCode v1.18.30 | OpenCode v2.0.3 |
| --- | --- | --- |
| server lifecycle | native | native |
| host event delivery | native | native |
| blocking model-request gate | native | native |
| session agent/model observation | native | native |
| before-tool execution notification | native | native |
| successful tool-completion notification | native | native |
| dynamic agent registration | native | native |
| ordered agent permission rules | native | native |
| global subagent-depth control | native | unsupported |
| workspace adapter registration | native | unsupported |

Client application logging is not part of this initial required shared surface because the only observed use is FOA best-effort diagnostic logging and OpenCode v2.0.3 exposes no equivalent logging operation in the Promise plugin context. TUI support is not claimed by this server matrix.

#### Scenario: FOA requires deeper subagent nesting on v2.0.3

- **WHEN** FOA declares global subagent-depth control as required on OpenCode v2.0.3
- **THEN** setup fails as an unsupported required capability
- **AND** the adapter does not silently accept the requested depth or fabricate configuration support

#### Scenario: demand-runtime requires workspace registration on v2.0.3

- **WHEN** demand-runtime declares workspace adapter registration as required on OpenCode v2.0.3
- **THEN** setup fails as an unsupported required capability
- **AND** the adapter does not emulate workspace registration through filesystem or configuration side effects

### Requirement: Workspace adaptation is limited to host registration

The workspace capability MUST adapt only the host registration and lifecycle boundary required to expose a consumer-owned workspace adapter. It MUST NOT absorb workspace implementation behavior from demand-runtime.

#### Scenario: demand-runtime registers its workspace adapter

- **WHEN** a generation supports workspace adapter registration
- **THEN** demand-runtime remains responsible for configure, create, target, remove, recovery, garbage collection, paths, write scope, and baseline behavior
- **AND** the version adapter owns only generation-specific host registration and lifecycle translation

#### Scenario: OpenCode v1 workspace registration is committed

- **GIVEN** OpenCode v1.18.30 exposes `experimental_workspace.register` but no unregister operation
- **WHEN** workspace registration is required during v1 adapter setup
- **THEN** the adapter registers the consumer-owned workspace adapter only after every rollback-capable required mapping has installed successfully
- **AND** disposal does not fabricate an unregister operation that OpenCode v1 does not provide

### Requirement: TUI adaptation is a separate runtime boundary

TUI plugin adaptation MUST remain separate from the normal server VersionAdapter. Server compatibility MUST NOT imply TUI compatibility.

#### Scenario: A generation exposes a TUI type surface without proven consumer compatibility

- **WHEN** a generation publishes TUI types or UI primitives but the external loader path or required consumer semantics have not been verified
- **THEN** the package does not claim TUI capability support for that generation
- **AND** TUI support remains unimplemented until its own specification and runtime evidence are complete

#### Scenario: Skill-usage TUI is adapted later

- **WHEN** TUI support is implemented for opencode-skill-usage
- **THEN** local slash-command execution, temporary key bindings, dialog lifecycle, state/path access, and application skill discovery are specified independently from server hooks
- **AND** server adapter modules do not acquire TUI responsibilities

### Requirement: Loader compatibility is verified rather than assumed

The adapter MUST keep generation selection outside consumer business logic, but it MUST NOT treat one observed module export shape as a permanent cross-generation loader contract without runtime verification.

#### Scenario: One package targets v1 and v2 loaders

- **WHEN** the package exposes entrypoints intended to load on OpenCode v1 and v2
- **THEN** the chosen packaging/export shape is verified against both supported runtime baselines
- **AND** consumers do not branch on OpenCode version to select that shape
- **AND** an unrecognized loader or host context fails explicitly rather than being guessed
