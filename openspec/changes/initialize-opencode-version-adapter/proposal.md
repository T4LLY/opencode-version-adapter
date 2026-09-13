# Initialize OpenCode Version Adapter

## Why

OpenCode plugin API generations expose different integration contracts, which otherwise forces consumer plugins to duplicate version-specific code or embed version checks throughout their business logic. A narrow compatibility package is needed so actual consumer plugins can use only the cross-version capabilities they require while keeping OpenCode version churn behind one boundary.

## What Changes

- Introduce `@xxx/opencode-version-adapter` as an OpenCode-specific compatibility boundary.
- Define compatibility per capability rather than claiming complete support for an OpenCode generation.
- Require capabilities to be added incrementally from real consumer requirements instead of mirroring the full OpenCode plugin API.
- Require unsupported mandatory capabilities to fail explicitly rather than degrade silently.
- Establish OpenCode v1 and OpenCode v2 as the initial generations, while allowing later generations to be added without rewriting consumer business logic.
- Derive the initial capability inventory from four real reference consumers: Folder-Oriented Agents (FOA), demand-runtime, opencode-agents-feed, and opencode-skill-usage.

## Capabilities

### New Capabilities

- `version-adaptation`: Provides a stable, capability-driven compatibility contract across supported OpenCode plugin API generations.

### Modified Capabilities

None.

## Impact

- Adds the initial OpenSpec project configuration and planning artifacts for the new package.
- Establishes the compatibility contract that future implementation changes must follow.
- Does not implement production code in this change.
- Records the first evidence-backed cross-generation capability classifications without implementing production code.
- Future capability requirements will extend the `version-adaptation` specification only when required by real consumers.
