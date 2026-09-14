import {
  AGENT_PERMISSION_ACTIONS,
  type AgentPermissionRules,
} from "../../src/contract/agent-permission";
import { InvalidHostContextError } from "../../src/contract/errors";
import { AGENT_MODES } from "../../src/contract/agent-registration";
import { createV1ConfigHook } from "../../src/adapters/v1/config";
import { createV1AgentRegistrationHandler } from "../../src/adapters/v1/capabilities/agent-registration";
import {
  createV1AgentPermissionRulesHandler,
  toV1AgentPermissionConfig,
} from "../../src/adapters/v1/capabilities/agent-permission-rules";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertJSONEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assertOrderedV1Mapping(): void {
  const rules: AgentPermissionRules = [
    {
      permission: "task",
      rules: [
        { pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny },
        { pattern: "worker", action: AGENT_PERMISSION_ACTIONS.allow },
        { pattern: "researcher", action: AGENT_PERMISSION_ACTIONS.allow },
      ],
    },
    {
      permission: "bash",
      rules: [
        { pattern: "*", action: AGENT_PERMISSION_ACTIONS.ask },
        { pattern: "git status*", action: AGENT_PERMISSION_ACTIONS.allow },
      ],
    },
  ];

  const mapped = toV1AgentPermissionConfig(rules);

  assertJSONEqual(
    mapped,
    {
      task: {
        "*": "deny",
        worker: "allow",
        researcher: "allow",
      },
      bash: {
        "*": "ask",
        "git status*": "allow",
      },
    },
    "v1 permission config must retain group and pattern insertion order",
  );
  assertJSONEqual(
    Object.keys(mapped.task as Record<string, string>),
    ["*", "worker", "researcher"],
    "later child rules must remain after the broad wildcard rule",
  );
}

function assertLastMatchingRuleWinsAfterMapping(): void {
  const mapped = toV1AgentPermissionConfig([
    {
      permission: "task",
      rules: [
        { pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny },
        { pattern: "worker", action: AGENT_PERMISSION_ACTIONS.allow },
      ],
    },
  ]);
  const rules = Object.entries(mapped.task as Record<string, string>);
  const evaluate = (pattern: string): string | undefined => {
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const candidate = rules[index];
      if (candidate === undefined) continue;
      if (candidate[0] === "*" || candidate[0] === pattern) return candidate[1];
    }
    return undefined;
  };

  assert(
    evaluate("worker") === "allow",
    "specific later child rule must override earlier wildcard deny",
  );
  assert(
    evaluate("unknown") === "deny",
    "wildcard deny must remain effective when no later child rule matches",
  );
}

function assertRepeatedPatternKeepsFinalSemanticPosition(): void {
  const mapped = toV1AgentPermissionConfig([
    {
      permission: "task",
      rules: [
        { pattern: "worker", action: AGENT_PERMISSION_ACTIONS.allow },
        { pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny },
        { pattern: "worker", action: AGENT_PERMISSION_ACTIONS.ask },
      ],
    },
  ]);

  const task = mapped.task as Record<string, string>;
  assertJSONEqual(
    Object.keys(task),
    ["*", "worker"],
    "a repeated pattern must be reinserted at its final semantic position",
  );
  assert(
    task.worker === "ask",
    "the final occurrence of a repeated pattern must supply its action",
  );
}

function assertDuplicatePermissionGroupsFailClosed(): void {
  let caught: unknown;
  try {
    toV1AgentPermissionConfig([
      {
        permission: "task",
        rules: [{ pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny }],
      },
      {
        permission: "task",
        rules: [{ pattern: "worker", action: AGENT_PERMISSION_ACTIONS.allow }],
      },
    ]);
  } catch (error) {
    caught = error;
  }

  assert(
    caught instanceof TypeError,
    "duplicate permission namespaces must be rejected instead of reordered lossily",
  );
}

async function assertRegistrationAndPermissionStaySeparate(): Promise<void> {
  const config: {
    agent?: Record<string, Record<string, unknown> | undefined>;
  } = {};
  const hook = createV1ConfigHook([
    createV1AgentRegistrationHandler(() => ({
      orchestrator: {
        prompt: "root prompt",
        mode: AGENT_MODES.primary,
      },
      worker: {
        prompt: "worker prompt",
        mode: AGENT_MODES.subagent,
      },
    })),
    createV1AgentPermissionRulesHandler(() => ({
      orchestrator: [
        {
          permission: "task",
          rules: [
            { pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny },
            { pattern: "worker", action: AGENT_PERMISSION_ACTIONS.allow },
          ],
        },
      ],
      worker: [
        {
          permission: "task",
          rules: [{ pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny }],
        },
      ],
    })),
  ]);

  await hook(config);

  assert(
    config.agent?.orchestrator?.prompt === "root prompt",
    "permission mapping must preserve the registered Agent definition",
  );
  assertJSONEqual(
    config.agent?.orchestrator?.permission,
    { task: { "*": "deny", worker: "allow" } },
    "permission capability must map consumer-owned child allowlist order",
  );
  assertJSONEqual(
    config.agent?.worker?.permission,
    { task: "deny" },
    "a singleton wildcard rule may use v1's equivalent action shorthand",
  );
}

async function assertMissingTargetFailsBeforeMutation(): Promise<void> {
  const existingAgent = { prompt: "keep" };
  const config: {
    agent: Record<string, Record<string, unknown> | undefined>;
  } = { agent: { existing: existingAgent } };
  const hook = createV1ConfigHook([
    createV1AgentPermissionRulesHandler(() => ({
      missing: [
        {
          permission: "task",
          rules: [{ pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny }],
        },
      ],
    })),
  ]);

  let caught: unknown;
  try {
    await hook(config);
  } catch (error) {
    caught = error;
  }

  assert(
    caught instanceof InvalidHostContextError,
    "permission mapping for an unregistered Agent must fail as invalid host context",
  );
  assert(
    config.agent.existing === existingAgent && Object.keys(config.agent).length === 1,
    "missing-target failure must not create or partially mutate Agents",
  );
}

async function assertAsyncPermissionPlanningIsAwaited(): Promise<void> {
  let release: (() => void) | undefined;
  let completed = false;
  const config: {
    agent: Record<string, Record<string, unknown> | undefined>;
  } = { agent: { worker: { prompt: "worker" } } };
  const hook = createV1ConfigHook([
    createV1AgentPermissionRulesHandler(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              worker: [
                {
                  permission: "task",
                  rules: [
                    { pattern: "*", action: AGENT_PERMISSION_ACTIONS.deny },
                  ],
                },
              ],
            });
        }),
    ),
  ]);

  const pending = hook(config).then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert(!completed, "v1 config hook must await permission planning");
  assert(release !== undefined, "async permission provider must have started");

  release();
  await pending;
  assert(completed, "v1 config hook must continue after permission planning resolves");
  assertJSONEqual(
    config.agent.worker?.permission,
    { task: "deny" },
    "resolved permission intent must be installed after awaiting the provider",
  );
}

void (async () => {
  assertOrderedV1Mapping();
  assertLastMatchingRuleWinsAfterMapping();
  assertRepeatedPatternKeepsFinalSemanticPosition();
  assertDuplicatePermissionGroupsFailClosed();
  await assertRegistrationAndPermissionStaySeparate();
  await assertMissingTargetFailsBeforeMutation();
  await assertAsyncPermissionPlanningIsAwaited();
})();
