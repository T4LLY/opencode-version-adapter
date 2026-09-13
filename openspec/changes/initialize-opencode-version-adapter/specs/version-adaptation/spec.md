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
