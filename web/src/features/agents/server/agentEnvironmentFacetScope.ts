import { type AgentTraceScope } from "@langfuse/shared/agents";

/** Editable environment facets retain agent membership while excluding their own selection. */
export function agentEnvironmentFacetScope(
  scope: AgentTraceScope,
): AgentTraceScope {
  if (
    scope.environment === null &&
    (scope.environmentFilter?.length ?? 0) === 0
  )
    return scope;
  return { ...scope, environment: null, environmentFilter: undefined };
}
