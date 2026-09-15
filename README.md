# opencode-version-adapter

Personal compatibility package for integrating multiple OpenCode generations behind a stable adapter boundary.

This package is primarily maintained for personal use.

It currently focuses on normalizing selected OpenCode v1 and v2 behaviors so consumers do not need to depend directly on generation-specific APIs.

## Install

npm install opencode-version-adapter

## Usage

Import the stable contract from the package root. `createOpenCodeServerPlugin` creates one server module shape for the supported OpenCode v1/v2 loader baselines without consumer-side version branching.

See [`docs/usage.md`](docs/usage.md) for integration guidelines and recommended usage patterns.

For applications that support more than one harness, see [`docs/harnesses.md`](docs/harnesses.md).

## Scope

This package is not intended to define a general cross-harness API.

Applications that support multiple harnesses should wrap it behind a higher-level harness abstraction such as `OpenCodeHarness`.

## License

MIT
