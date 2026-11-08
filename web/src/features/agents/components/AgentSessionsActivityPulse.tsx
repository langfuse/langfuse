import { type FilterState } from "@langfuse/shared";
import { type AgentTraceScope } from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { useAgentActivityDrill } from "../hooks/useAgentActivityDrill";
import { toAgentActivityState } from "../lib/agentActivity";
import { AgentActivityPulse } from "./AgentActivityPulse";

export function AgentSessionsActivityPulse({
  projectId,
  agentScope,
  filter,
}: {
  projectId: string;
  agentScope: AgentTraceScope;
  filter: FilterState;
}) {
  const query = api.sessions.agentActivity.useQuery({
    projectId,
    agentScope,
    filter,
    orderBy: null,
    bucketCount: 100,
  });
  const drill = useAgentActivityDrill(
    { projectId, from: agentScope.from, to: agentScope.to },
    "agent_sessions",
  );

  return (
    <AgentActivityPulse
      activity={toAgentActivityState(query)}
      label="Active sessions"
      description="Sessions with activity in each time bucket. A session can appear in more than one bucket."
      onSelectRange={drill}
    />
  );
}
