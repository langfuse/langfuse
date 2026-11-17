import { type AgentScope, type AgentSummary } from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { type AgentActivityState } from "../lib/agentActivity";
import { AgentGalleryCard } from "./AgentGalleryCard";
import { useAgentActivityClock } from "../hooks/useAgentActivityClock";

export function AgentsGallery({
  agents,
  scope,
}: {
  agents: AgentSummary[];
  scope: AgentScope;
}) {
  const now = useAgentActivityClock();
  const identities = agents
    .map((agent) => agent.identity)
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.value.localeCompare(right.value),
    );
  const activity = api.agents.activity.useQuery(
    { ...scope, identities },
    { enabled: identities.length > 0 },
  );
  const activityByAgent = new Map(
    activity.data?.series.map((series) => [
      `${series.identity.kind}:${series.identity.value}`,
      series,
    ]) ?? [],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {agents.map((agent) => {
          const key = `${agent.identity.kind}:${agent.identity.value}`;
          const series = activityByAgent.get(key);
          let state: AgentActivityState = { status: "error" };
          if (activity.isPending) state = { status: "loading" };
          else if (!activity.isError && activity.data && series)
            state = {
              status: "success",
              data: {
                from: activity.data.from,
                to: activity.data.to,
                bucketMs: activity.data.bucketMs,
                buckets: series.buckets,
              },
            };
          return (
            <AgentGalleryCard
              key={key}
              agent={agent}
              scope={scope}
              activity={state}
              now={now}
            />
          );
        })}
      </div>
    </div>
  );
}
