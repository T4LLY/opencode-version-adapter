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

### Requirement: Lifecycle ownership is explicit and reversible

The adapter MUST present a consistent setup-to-dispose lifecycle for capabilities that acquire hooks, subscriptions, registrations, or other resources, regardless of the native lifecycle shape of the active OpenCode generation.

#### Scenario: Setup succeeds

- **WHEN** adapter setup installs one or more owned resources successfully
- **THEN** exactly one generation-level cleanup owner is responsible for releasing those resources
- **AND** consumer code does not need to know generation-specific teardown behavior

#### Scenario: Setup fails after partial installation

- **WHEN** adapter setup fails after one or more owned resources have already been installed
- **THEN** the adapter releases resources installed by that failed setup attempt before surfacing the failure
- **AND** it does not leave a partially active adapter behind

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
