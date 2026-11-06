import { type FilterState, type TracingSearchType } from "@langfuse/shared";
import { type AgentTraceScope } from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { useAgentActivityDrill } from "../hooks/useAgentActivityDrill";
import { toAgentActivityState } from "../lib/agentActivity";
import { AgentActivityPulse } from "./AgentActivityPulse";

const ACTIVITY_LABELS = {
  runs: "Agent runs",
  tools: "Tool calls",
  traces: "Matching observations",
} as const;

export function AgentEventsActivityPulse({
  projectId,
  agentScope,
  filter,
  searchQuery,
  searchType,
}: {
  projectId: string;
  agentScope: AgentTraceScope;
  filter: FilterState;
  searchQuery: string | null;
  searchType: TracingSearchType[];
}) {
  const query = api.events.agentActivity.useQuery({
    projectId,
    agentScope,
    filter,
    searchQuery,
    searchType,
    orderBy: null,
    bucketCount: 100,
  });
  const mode = agentScope.mode ?? "traces";
  const drill = useAgentActivityDrill(
    { projectId, from: agentScope.from, to: agentScope.to },
    `agent_${mode}`,
  );

  return (
    <AgentActivityPulse
      activity={toAgentActivityState(query)}
      label={ACTIVITY_LABELS[mode]}
      description="Recorded observations matching this table's agent scope, search, filters, and selected period."
      onSelectRange={drill}
    />
  );
}
