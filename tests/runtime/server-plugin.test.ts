import {
  CAPABILITIES,
  createOpenCodeServerPlugin,
  UnsupportedCapabilityError,
} from "../../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface ModuleNamespace {
  readonly default?: unknown;
}

function selectLikeV1Loader(module: ModuleNamespace) {
  const value = module.default;
  if (value === null || typeof value !== "object") {
    throw new TypeError("v1 default export must be an object");
  }
  const server = Reflect.get(value, "server");
  if (typeof server !== "function") {
    throw new TypeError("v1 server export is missing");
  }
  return server as (context: unknown) => Promise<{ dispose: () => Promise<void> }>;
}

function selectLikeV2Loader(module: ModuleNamespace) {
  const value = module.default;
  if (value === null || typeof value !== "object") {
    throw new TypeError("v2 default export must be an object");
  }
  const id = Reflect.get(value, "id");
  const setup = Reflect.get(value, "setup");
  if (typeof id !== "string" || typeof setup !== "function") {
    throw new TypeError("v2 id/setup export is missing");
  }
  return { id, setup: setup as (context: unknown) => Promise<(() => Promise<void>) | void> };
}

async function assertOneDefaultExportSupportsBothLoaderShapes(): Promise<void> {
  let cleanupCount = 0;
  const plugin = createOpenCodeServerPlugin({
    id: "adapter-smoke",
    requiredCapabilities: [CAPABILITIES.serverLifecycle],
    bindings: {
      lifecycleCleanup() {
        cleanupCount += 1;
      },
    },
  });
  const module = { default: plugin };

  const v1 = selectLikeV1Loader(module);
  const v1Hooks = await v1({});
  assert(typeof v1Hooks.dispose === "function", "v1 loader must receive a dispose hook");
  await v1Hooks.dispose();
  assert(cleanupCount === 1, "v1 disposal must run consumer lifecycle cleanup");

  const v2 = selectLikeV2Loader(module);
  assert(v2.id === "adapter-smoke", "v2 loader must preserve the shared plugin id");
  const cleanup = await v2.setup({});
  assert(typeof cleanup === "function", "v2 loader must receive one cleanup owner");
  await cleanup?.();
  assert(Number(cleanupCount) === 2, "v2 cleanup must run consumer lifecycle cleanup");
}

async function assertBindingsCanBeCreatedFromHostOptions(): Promise<void> {
  const seen: unknown[] = [];
  const plugin = createOpenCodeServerPlugin({
    id: "adapter-options",
    requiredCapabilities: [CAPABILITIES.serverLifecycle],
    createBindings({ options }) {
      seen.push(options);
      return {};
    },
  });

  const v1 = selectLikeV1Loader({ default: plugin });
  const v1Hooks = await plugin.server({}, { retentionDays: 7 });
  await (v1Hooks as { dispose: () => Promise<void> }).dispose();

  const v2 = selectLikeV2Loader({ default: plugin });
  const cleanup = await v2.setup({ options: { retentionDays: 14 } });
  await cleanup?.();

  assert(
    JSON.stringify(seen) === JSON.stringify([{ retentionDays: 7 }, { retentionDays: 14 }]),
    "binding factory must receive generation-independent host options per activation",
  );
  void v1;
}

async function assertGenerationSupportDifferenceNeedsNoConsumerBranch(): Promise<void> {
  let registered = false;
  const plugin = createOpenCodeServerPlugin({
    id: "workspace-only-on-v1",
    requiredCapabilities: [CAPABILITIES.workspaceRegistration],
    bindings: {
      workspaceRegistration: {
        type: "demand",
        adapter: {
          name: "Demand",
          description: "Demand",
          configure(info) {
            return info;
          },
          create() {},
          remove() {},
          target() {
            return { type: "local", directory: "/tmp/demand" };
          },
        },
      },
    },
  });
  const module = { default: plugin };

  const v1 = selectLikeV1Loader(module);
  const hooks = await v1({
    experimental_workspace: {
      register(type: string) {
        registered = type === "demand";
      },
    },
  });
  assert(registered, "v1 host selection must activate the native workspace mapping");
  await hooks.dispose();

  const v2 = selectLikeV2Loader(module);
  let error: unknown;
  try {
    await v2.setup({});
  } catch (caught) {
    error = caught;
  }
  assert(
    error instanceof UnsupportedCapabilityError,
    "the same export must fail closed when the selected generation cannot provide a required capability",
  );
}

void (async () => {
  await assertOneDefaultExportSupportsBothLoaderShapes();
  await assertBindingsCanBeCreatedFromHostOptions();
  await assertGenerationSupportDifferenceNeedsNoConsumerBranch();
})();
