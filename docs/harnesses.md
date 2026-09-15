# Harness Integration Guidelines

`opencode-version-adapter` is OpenCode-specific. Applications may place it behind a higher-level harness abstraction so additional agent harnesses can be supported without making OpenCode the application-wide compatibility boundary.

## Recommended layering

Use the following conceptual layering:

```text
Application / Plugin
        |
        v
Harness
        |
        +-- OpenCodeHarness
        |       |
        |       +-- opencode-version-adapter
        |
        +-- <OtherProduct>Harness
```

The outer harness abstraction owns cross-harness concepts. `OpenCodeHarness` owns the mapping from those concepts into the OpenCode-specific adapter contract.

Do not promote OpenCode-specific `CapabilityId` values, payload shapes, lifecycle details, or SDK types into the shared harness contract merely because OpenCode is the first implementation.

## Naming

The shared cross-harness contract must be named `Harness`.

Concrete harness implementations must use:

`<Product>Harness`

Examples:

- `OpenCodeHarness`
- `ClaudeCodeHarness`
- `CodexHarness`
- `GeminiCliHarness`

Use the product's established name converted to PascalCase. Keep meaningful internal capitalization where practical, as in `OpenCodeHarness`.

## Harness and adapter are different roles

Reserve `Harness` for an integration with a concrete agent harness or execution environment.

Reserve `Adapter` for compatibility or API-translation layers inside a harness implementation.

For example, `OpenCodeHarness` may internally use `opencode-version-adapter`, but the version adapter itself is not the cross-harness `Harness` abstraction.

Do not use `Manager`, `Controller`, `Provider`, or `Backend` as interchangeable synonyms for `Harness`.

If a component is later needed to select, own, start, or stop multiple harness implementations, it may be named `HarnessRuntime`.

## Wrapper responsibility

Keep the outer wrapper thin. It may select a harness implementation, translate shared inputs, own lifecycle, and expose shared diagnostics, but harness-specific implementation logic should remain in the corresponding concrete harness.

Avoid accumulating every harness implementation in one class. As more harnesses are added, keep each `<Product>Harness` as a separate implementation behind the shared `Harness` contract.

## Capability mapping

Cross-harness capabilities should be defined by the outer `Harness` contract only when their semantics are genuinely shared.

Do not automatically reuse OpenCode capability names as universal harness capabilities. A future harness may expose similar behavior through a different lifecycle, data model, or guarantee.

When semantics differ, perform an explicit mapping inside the concrete harness or keep the feature harness-specific rather than forcing a misleading common abstraction.
