import { CAPABILITIES } from "../../src/contract/capabilities";
import { InvalidHostContextError } from "../../src/contract/errors";
import type {
  WorkspaceAdapter,
  WorkspaceInfo,
} from "../../src/contract/workspace-registration";
import {
  createV1WorkspaceRegistrationCapability,
  type V1WorkspaceAdapter,
} from "../../src/adapters/v1/capabilities/workspace-registration";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const info: WorkspaceInfo = Object.freeze({
  id: "workspace-1",
  type: "demand",
  name: "writer",
  branch: null,
  directory: null,
  extra: Object.freeze({ writeScope: ["src/*"] }),
  projectID: "project-1",
});

function createConsumerAdapter(events: string[]): WorkspaceAdapter {
  return {
    name: "Demand Workspace",
    description: "Isolated demand-runtime Writer workspace",
    configure(input) {
      assert(input === info, "configure must receive the original WorkspaceInfo");
      events.push("configure");
      return Object.freeze({ ...input, directory: "/tmp/workspace-1" });
    },
    async create(input) {
      assert(input === info, "create must receive the original WorkspaceInfo");
      events.push("create");
    },
    async remove(input) {
      assert(input === info, "remove must receive the original WorkspaceInfo");
      events.push("remove");
    },
    target(input) {
      assert(input === info, "target must receive the original WorkspaceInfo");
      events.push("target");
      return { type: "local", directory: "/tmp/workspace-1" };
    },
  };
}

async function assertRegistrationAndLifecycleMapping(): Promise<void> {
  const events: string[] = [];
  let registeredType: string | undefined;
  let registeredAdapter: V1WorkspaceAdapter | undefined;
  const capability = createV1WorkspaceRegistrationCapability({
    type: "demand",
    adapter: createConsumerAdapter(events),
  });

  const cleanup = await capability.install({
    experimental_workspace: {
      register(type, adapter) {
        registeredType = type;
        registeredAdapter = adapter;
        events.push("register");
      },
    },
  });

  assert(
    capability.capability === CAPABILITIES.workspaceRegistration,
    "v1 Workspace registration must identify the shared capability",
  );
  assert(registeredType === "demand", "v1 must preserve the exact Workspace type");
  assert(registeredAdapter !== undefined, "v1 must register one native adapter");
  assert(
    cleanup === undefined,
    "v1 Workspace registration must not fabricate an unregister cleanup",
  );

  const configured = await registeredAdapter.configure(info);
  assert(
    configured.directory === "/tmp/workspace-1",
    "configure result must pass through unchanged",
  );

  await registeredAdapter.create(
    info,
    { OPENCODE_WORKSPACE_ID: "workspace-1" },
    { ...info, id: "source-workspace" },
  );
  const target = await registeredAdapter.target(info);
  await registeredAdapter.remove(info);

  assert(
    target.type === "local" && target.directory === "/tmp/workspace-1",
    "local Workspace target must pass through unchanged",
  );
  assert(
    events.join("|") === "register|configure|create|target|remove",
    "v1 wrapper must expose only the approved consumer lifecycle in host order",
  );
}

async function assertMissingRegistryFailsClosed(): Promise<void> {
  const capability = createV1WorkspaceRegistrationCapability({
    type: "demand",
    adapter: createConsumerAdapter([]),
  });

  let error: unknown;
  try {
    await capability.install({});
  } catch (caught) {
    error = caught;
  }

  assert(
    error instanceof InvalidHostContextError,
    "missing experimental_workspace registry must fail as invalid host context",
  );
}

function assertInvalidTypeRejectedBeforeHostMutation(): void {
  let error: unknown;
  try {
    createV1WorkspaceRegistrationCapability({
      type: "   ",
      adapter: createConsumerAdapter([]),
    });
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof TypeError, "blank Workspace type must be rejected");
}

void (async () => {
  await assertRegistrationAndLifecycleMapping();
  await assertMissingRegistryFailsClosed();
  assertInvalidTypeRejectedBeforeHostMutation();
})();
