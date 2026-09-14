/**
 * Consumer-owned minimum global nesting depth required for subagent execution.
 *
 * The consumer decides the required depth from its own hierarchy. A generation
 * adapter may preserve a larger host-configured value but must not lower it.
 */
export interface SubagentDepthRequirement {
  readonly minimumDepth: number;
}
