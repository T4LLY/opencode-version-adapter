# Testing

The repository is an npm package and compiles to Node ESM in `dist/`.

## Install development dependencies

npm install

## Type-check

npm run check

## Contract and adapter tests

npm test

The test script compiles the TypeScript sources and script-style tests to `.tmp-test/`, then executes every compiled `*.test.js` file sequentially.

## Build the npm package

npm run build

The build emits JavaScript, declarations, declaration maps, and source maps under `dist/`.

## Real loader smoke

Build first so the smoke test exercises the same compiled package entrypoint that npm consumers import. With the pinned `opencode` v1 and `opencode2` v2 binaries available on PATH, run:

npm run build
node tests/runtime/real-loader-smoke.mjs

## OpenSpec validation

openspec validate initialize-opencode-version-adapter --type change --strict

## Runner caveat

Do not use `bun test` as the suite command. These tests are executable scripts rather than `bun:test` registrations.
