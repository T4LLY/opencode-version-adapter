import { CAPABILITIES, CAPABILITY_SUPPORT, type CapabilitySupportMap } from "../../src/contract/capabilities";
import type { DiagnosticReporter } from "../../src/contract/diagnostics";
import { createAdapterHandle } from "../../src/contract/lifecycle";
import {
  createV2Adapter,
  createV2ServerDefinition,
  createV2ServerLifecycleCapability,
} from "../../src/adapters/v2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const support = {
  [CAPABILITIES.serverLifecycle]: CAPABILITY_SUPPORT.native,
  [CAPABILITIES.hostEventDelivery]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.modelRequestGate]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.sessionAgentModelObservation]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.toolBeforeExecution]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.successfulToolCompletion]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.agentRegistration]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.agentPermissionRules]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.subagentDepth]: CAPABILITY_SUPPORT.unsupported,
  [CAPABILITIES.workspaceRegistration]: CAPABILITY_SUPPORT.unsupported,
} satisfies CapabilitySupportMap;

async function assertServerSetupOwnsAdapterHandle(): Promise<void> {
  const events: string[] = [];
  const adapter = createV2Adapter({
    capabilities: support,
    capabilityAdapters: [createV2ServerLifecycleCapability<{ value: string }>()],
  });

  const wrapped = {
    ...adapter,
    async setup(input: {
      context: { value: string };
      requiredCapabilities: readonly (typeof CAPABILITIES.serverLifecycle)[];
      diagnostics?: DiagnosticReporter;
    }) {
      events.push(`setup:${input.context.value}`);
      assert(input.diagnostics === diagnostics, "v2 server boundary must forward the external diagnostic reporter");
      const handle = await adapter.setup(input);
      return createAdapterHandle(async () => {
        events.push("dispose");
        await handle.dispose();
      });
    },
  };

  const diagnostics: DiagnosticReporter = () => {};
  const definition = createV2ServerDefinition({
    id: "version-adapter-test",
    adapter: wrapped,
    requiredCapabilities: [CAPABILITIES.serverLifecycle],
    diagnostics,
  });

  assert(definition.id === "version-adapter-test", "v2 definition must preserve plugin id");
  const cleanup = await definition.setup({ value: "ctx" });
  assert(typeof cleanup === "function", "v2 setup must return one cleanup owner");
  assert(events.join("|") === "setup:ctx", "v2 setup must receive the native context unchanged");

  await cleanup?.();
  await cleanup?.();
  assert(events.join("|") === "setup:ctx|dispose", "returned v2 cleanup must retain adapter idempotency");
}

function assertInvalidPluginIDFailsEarly(): void {
  const adapter = createV2Adapter({
    capabilities: support,
    capabilityAdapters: [createV2ServerLifecycleCapability<{}>()],
  });

  let error: unknown;
  try {
    createV2ServerDefinition({
      id: "   ",
      adapter,
      requiredCapabilities: [CAPABILITIES.serverLifecycle],
    });
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof TypeError, "blank v2 plugin id must fail before host setup");
}

(async () => {
  await assertServerSetupOwnsAdapterHandle();
  assertInvalidPluginIDFailsEarly();
})();
