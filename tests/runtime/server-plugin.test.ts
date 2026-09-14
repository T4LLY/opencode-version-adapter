import { CAPABILITIES } from "../../src/contract/capabilities";
import { createOpenCodeServerPlugin } from "../../src/internal/server-plugin";
import { UnsupportedCapabilityError } from "../../src/contract/errors";

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
  const plugin = createOpenCodeServerPlugin({
    id: "adapter-smoke",
    requiredCapabilities: [CAPABILITIES.serverLifecycle],
    bindings: {},
  });
  const module = { default: plugin };

  const v1 = selectLikeV1Loader(module);
  const v1Hooks = await v1({});
  assert(typeof v1Hooks.dispose === "function", "v1 loader must receive a dispose hook");
  await v1Hooks.dispose();

  const v2 = selectLikeV2Loader(module);
  assert(v2.id === "adapter-smoke", "v2 loader must preserve the shared plugin id");
  const cleanup = await v2.setup({});
  assert(typeof cleanup === "function", "v2 loader must receive one cleanup owner");
  await cleanup?.();
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
  await assertGenerationSupportDifferenceNeedsNoConsumerBranch();
})();
