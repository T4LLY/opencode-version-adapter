# Testing

This repository intentionally does not define package-manager metadata or a test runner. The current tests are script-style TypeScript files and must be compiled before Node executes them.

## Full local verification

Run from PowerShell at the repository root:

$ts = Get-ChildItem src,tests -Recurse -Filter *.ts | Select-Object -ExpandProperty FullName; npx -y -p typescript@5.8.3 tsc --strict --target ES2022 --module commonjs --moduleResolution node --outDir .tmp-test $ts; if ($LASTEXITCODE -eq 0) { $tests = Get-ChildItem .tmp-test\tests -Recurse -Filter *.test.js | Select-Object -ExpandProperty FullName; foreach ($test in $tests) { node $test; if ($LASTEXITCODE -ne 0) { break } } }; if ($LASTEXITCODE -eq 0) { openspec validate initialize-opencode-version-adapter --type change --strict }

The `.tmp-test/` directory contains generated JavaScript only and may be deleted after verification.

## Real loader smoke

With the pinned `opencode` v1 and `opencode2` v2 binaries available on PATH, run:

node tests/runtime/real-loader-smoke.mjs

## Runner caveats

Do not use `bun test` as the suite command. These tests are executable scripts rather than `bun:test` registrations, so Bun's test collector does not discover them.

Do not use `node --test` directly on the TypeScript sources. The current extensionless TypeScript imports are intended to be compiled first and are not directly resolvable by Node's test runner.
