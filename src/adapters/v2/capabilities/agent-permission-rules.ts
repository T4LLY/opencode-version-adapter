import type {
  AgentPermissionRuleGroup,
  AgentPermissionRules,
  AgentPermissionRulesProvider,
} from "../../../contract/agent-permission";
import { CAPABILITIES } from "../../../contract/capabilities";
import { InvalidHostContextError } from "../../../contract/errors";
import type { V2CapabilityAdapter } from "../adapter";
import type {
  V2AgentContext,
  V2AgentPermissionRule,
} from "../agent-domain";
import { unwrapV2AgentListResult } from "../agent-list";

function toV2PermissionGroup(
  group: AgentPermissionRuleGroup,
): readonly V2AgentPermissionRule[] {
  return group.rules.map((rule) => ({
    action: group.permission,
    resource: rule.pattern,
    effect: rule.action,
  }));
}

/**
 * Flatten generation-independent permission groups into OpenCode v2's ordered
 * Permission.Ruleset while preserving group and rule order exactly.
 */
export function toV2AgentPermissionRules(
  rules: AgentPermissionRules,
): readonly V2AgentPermissionRule[] {
  const namespaces = new Set<string>();
  const mapped: V2AgentPermissionRule[] = [];

  for (const group of rules) {
    if (namespaces.has(group.permission)) {
      throw new TypeError(
        `Agent permission namespace appears more than once: ${group.permission}`,
      );
    }
    namespaces.add(group.permission);
    mapped.push(...toV2PermissionGroup(group));
  }

  return mapped;
}

/**
 * Apply ordered permission intent to Agents that already exist after earlier
 * v2 Agent transforms. Existing host rules stay first and consumer rules are
 * appended so OpenCode v2's last-match evaluator preserves config semantics.
 */
export function createV2AgentPermissionRulesCapability(
  provideRules: AgentPermissionRulesProvider,
): V2CapabilityAdapter<V2AgentContext> {
  return {
    capability: CAPABILITIES.agentPermissionRules,
    async install(context) {
      const agent = context.agent;
      if (
        agent === undefined ||
        typeof agent.list !== "function" ||
        typeof agent.transform !== "function"
      ) {
        throw new InvalidHostContextError(
          "OpenCode v2 agent domain is unavailable for Agent permission rules",
        );
      }

      const planned = await provideRules();
      const mapped = Object.entries(planned).map(([agentID, rules]) => ({
        agentID,
        rules: toV2AgentPermissionRules(rules),
      }));

      // Validate against the state produced by transforms already installed by
      // the host and by agent-registration. This must happen before installing
      // the permission transform so a missing target cannot create an Agent.
      const existing = new Set(
        unwrapV2AgentListResult(await agent.list()).map((item) => item.id),
      );
      for (const plan of mapped) {
        if (!existing.has(plan.agentID)) {
          throw new InvalidHostContextError(
            `OpenCode v2 permission target Agent is not registered: ${plan.agentID}`,
          );
        }
      }

      const registration = await agent.transform((editor) => {
        for (const plan of mapped) {
          const current = editor.get(plan.agentID);
          if (current === undefined) {
            throw new InvalidHostContextError(
              `OpenCode v2 permission target Agent disappeared: ${plan.agentID}`,
            );
          }

          current.permissions = [...current.permissions, ...plan.rules];
        }
      });

      if (
        registration === undefined ||
        typeof registration.dispose !== "function"
      ) {
        throw new InvalidHostContextError(
          "OpenCode v2 Agent permission transform did not return a disposable registration",
        );
      }

      return async () => {
        await registration.dispose();
      };
    },
  };
}
