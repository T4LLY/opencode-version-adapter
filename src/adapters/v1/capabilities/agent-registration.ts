import type {
  AgentDefinition,
  AgentRegistration,
} from "../../../contract/agent-registration";
import type { V1ConfigHandler } from "../config";

/** Map one shared Agent definition to OpenCode v1's config representation. */
export function toV1AgentConfig(
  definition: AgentDefinition,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  if (definition.model !== undefined) mapped.model = definition.model;
  if (definition.variant !== undefined) mapped.variant = definition.variant;
  if (definition.temperature !== undefined) {
    mapped.temperature = definition.temperature;
  }
  if (definition.topP !== undefined) mapped.top_p = definition.topP;
  if (definition.prompt !== undefined) mapped.prompt = definition.prompt;
  if (definition.description !== undefined) {
    mapped.description = definition.description;
  }
  if (definition.mode !== undefined) mapped.mode = definition.mode;
  if (definition.hidden !== undefined) mapped.hidden = definition.hidden;
  if (definition.options !== undefined) mapped.options = definition.options;
  if (definition.color !== undefined) mapped.color = definition.color;
  if (definition.steps !== undefined) mapped.steps = definition.steps;

  return mapped;
}

/**
 * Register consumer-planned Agents through OpenCode v1's mutable config hook.
 *
 * Existing IDs are exposed to the consumer before mutation so collision policy
 * remains consumer-owned. If the consumer deliberately returns an existing ID,
 * that returned definition is the consumer's chosen replacement.
 */
export function createV1AgentRegistrationHandler(
  register: AgentRegistration,
): V1ConfigHandler {
  return async (config) => {
    const existing = config.agent ?? {};
    const existingAgentIDs = Object.freeze(Object.keys(existing));
    const definitions = await register({ existingAgentIDs });
    const next: Record<string, Record<string, unknown> | undefined> = {
      ...existing,
    };

    for (const [id, definition] of Object.entries(definitions)) {
      next[id] = toV1AgentConfig(definition);
    }

    config.agent = next;
  };
}
