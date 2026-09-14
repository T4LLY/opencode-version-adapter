import type {
  AgentDefinition,
  AgentRegistration,
} from "../../../contract/agent-registration";
import { CAPABILITIES } from "../../../contract/capabilities";
import { InvalidHostContextError } from "../../../contract/errors";
import type { V2CapabilityAdapter } from "../adapter";

export interface V2AgentModelRef {
  readonly id: string;
  readonly providerID: string;
  readonly variant?: string;
}

export interface V2AgentInfo {
  readonly id: string;
  model?: V2AgentModelRef;
  request: {
    settings: Record<string, unknown>;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  system?: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  hidden: boolean;
  color?: string;
  steps?: number;
  permissions: unknown[];
}

export interface V2AgentEditor {
  list(): readonly V2AgentInfo[];
  get(id: string): V2AgentInfo | undefined;
  default(id: string | undefined): void;
  update(id: string, update: (agent: V2AgentInfo) => void): void;
  remove(id: string): void;
}

export interface V2AgentRegistrationHandle {
  dispose(): Promise<void>;
}

export interface V2AgentDomain {
  list(): Promise<readonly V2AgentInfo[]>;
  transform(
    update: (editor: V2AgentEditor) => void,
  ): Promise<V2AgentRegistrationHandle>;
}

export interface V2AgentContext {
  readonly agent?: V2AgentDomain;
}

interface V2AgentPlan {
  readonly id: string;
  readonly definition: AgentDefinition;
  readonly model?: V2AgentModelRef;
}

/** Parse the canonical shared provider/model reference into OpenCode v2 Model.Ref. */
export function toV2AgentModelRef(
  model: string,
  variant?: string,
): V2AgentModelRef {
  const providerEnd = model.indexOf("/");
  if (
    providerEnd <= 0 ||
    providerEnd === model.length - 1 ||
    model.includes("#") ||
    (variant !== undefined && (variant.length === 0 || variant.includes("#")))
  ) {
    throw new TypeError(`Invalid shared Agent model reference: ${model}`);
  }

  return Object.freeze({
    providerID: model.slice(0, providerEnd),
    id: model.slice(providerEnd + 1),
    ...(variant === undefined ? {} : { variant }),
  });
}

function planAgent(id: string, definition: AgentDefinition): V2AgentPlan {
  return Object.freeze({
    id,
    definition,
    ...(definition.model === undefined
      ? {}
      : {
          model: toV2AgentModelRef(
            definition.model.model,
            definition.model.variant,
          ),
        }),
  });
}

/** Apply only non-permission Agent fields owned by the registration capability. */
export function applyV2AgentDefinition(
  agent: V2AgentInfo,
  plan: V2AgentPlan,
): void {
  const definition = plan.definition;

  if (plan.model !== undefined) agent.model = plan.model;
  if (definition.prompt !== undefined) agent.system = definition.prompt;
  if (definition.description !== undefined) {
    agent.description = definition.description;
  }
  if (definition.mode !== undefined) agent.mode = definition.mode;
  if (definition.hidden !== undefined) agent.hidden = definition.hidden;
  if (definition.color !== undefined) agent.color = definition.color;
  if (definition.steps !== undefined) agent.steps = definition.steps;

  if (
    definition.temperature !== undefined ||
    definition.topP !== undefined ||
    definition.options !== undefined
  ) {
    agent.request.settings = {
      ...agent.request.settings,
      ...(definition.options ?? {}),
      ...(definition.temperature === undefined
        ? {}
        : { temperature: definition.temperature }),
      ...(definition.topP === undefined ? {} : { topP: definition.topP }),
    };
  }
}

/**
 * Register consumer-planned Agents through OpenCode v2.0.3's replayable
 * Agent transform. Planning is completed before the transform is installed so
 * async collision policy never runs inside v2's synchronous transform callback.
 */
export function createV2AgentRegistrationCapability(
  register: AgentRegistration,
): V2CapabilityAdapter<V2AgentContext> {
  return {
    capability: CAPABILITIES.agentRegistration,
    async install(context) {
      const agent = context.agent;
      if (
        agent === undefined ||
        typeof agent.list !== "function" ||
        typeof agent.transform !== "function"
      ) {
        throw new InvalidHostContextError(
          "OpenCode v2 agent domain is unavailable for Agent registration",
        );
      }

      const existing = await agent.list();
      const existingAgentIDs = Object.freeze(existing.map((item) => item.id));
      const definitions = await register({ existingAgentIDs });
      const plans = Object.entries(definitions).map(([id, definition]) =>
        planAgent(id, definition),
      );

      const registration = await agent.transform((editor) => {
        for (const plan of plans) {
          editor.update(plan.id, (item) => {
            applyV2AgentDefinition(item, plan);
          });
        }
      });

      if (
        registration === undefined ||
        typeof registration.dispose !== "function"
      ) {
        throw new InvalidHostContextError(
          "OpenCode v2 Agent transform did not return a disposable registration",
        );
      }

      return async () => {
        await registration.dispose();
      };
    },
  };
}
