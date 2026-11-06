import { type FilterState, type SessionOptions } from "@langfuse/shared";
import { type AgentTraceScope } from "@langfuse/shared/agents";
import { buildAgentSessionMembershipQuery } from "@langfuse/shared/agents/server";
import {
  agentSessionActivityFilter,
  getBooleanScoresGroupedByName,
  getCategoricalScoresGroupedByName,
  getEventsExactFilterOptionsForColumns,
  getNumericScoresGroupedByName,
} from "@langfuse/shared/src/server";
import { agentEnvironmentFacetScope } from "./agentEnvironmentFacetScope";

export type AgentSessionFilterOptions = SessionOptions & {
  toolNames?: string[];
  calledToolNames?: string[];
};

export async function getAgentSessionFilterOptions({
  projectId,
  agentScope,
  eventsFilter,
  scoreFilter,
}: {
  projectId: string;
  agentScope: AgentTraceScope;
  eventsFilter: FilterState;
  scoreFilter: FilterState;
}): Promise<AgentSessionFilterOptions> {
  const membership = buildAgentSessionMembershipQuery({
    projectId,
    ...agentScope,
  });
  const scoreScope = {
    ...membership,
    query: `s.session_id IN (${membership.query})`,
  };
  const environmentScope = agentEnvironmentFacetScope(agentScope);
  const splitEnvironment = environmentScope !== agentScope;
  const [options, environmentOptions, numeric, categorical, boolean] =
    await Promise.all([
      getEventsExactFilterOptionsForColumns({
        projectId,
        filter: eventsFilter,
        columns: [
          "userId",
          "traceTags",
          ...(!splitEnvironment ? (["environment"] as const) : []),
          "toolNames",
          "calledToolNames",
        ],
        scopeFilter: agentSessionActivityFilter(projectId, agentScope),
      }),
      splitEnvironment
        ? getEventsExactFilterOptionsForColumns({
            projectId,
            filter: eventsFilter.filter(
              (filter) => filter.column.toLowerCase() !== "environment",
            ),
            columns: ["environment"],
            scopeFilter: agentSessionActivityFilter(
              projectId,
              environmentScope,
            ),
          })
        : Promise.resolve([]),
      getNumericScoresGroupedByName(projectId, scoreFilter, scoreScope),
      getCategoricalScoresGroupedByName(projectId, scoreFilter, scoreScope),
      getBooleanScoresGroupedByName(projectId, scoreFilter, scoreScope),
    ]);
  const values = (column: (typeof options)[number]["column"]) =>
    [...options, ...environmentOptions].filter(
      (option) => option.column === column,
    );
  return {
    userIds: values("userId"),
    tags: values("traceTags"),
    environment: values("environment"),
    toolNames: values("toolNames").map((option) => option.value),
    calledToolNames: values("calledToolNames").map((option) => option.value),
    scores_avg: numeric.map((score) => score.name),
    score_categories: categorical,
    score_booleans: boolean.map((score) => score.name),
  };
}
