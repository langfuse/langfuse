import Link from "next/link";
import { type AgentSessionProjection } from "@langfuse/shared";
import { AgentIdentity, useAgentAppearance } from "../appearance";
import { AgentComparisonSparkline } from "./AgentComparisonSparkline";
import {
  agentPath,
  type OverviewAgent,
  type OverviewScope,
} from "./prepareOverview";

export function AgentPreview({
  agent,
  projection,
  scope,
}: {
  agent: OverviewAgent;
  projection: AgentSessionProjection;
  scope: OverviewScope;
}) {
  const appearance = useAgentAppearance(scope.projectId, agent.agentName);
  return (
    <div className="ph-no-capture flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 p-4">
      <AgentIdentity projectId={scope.projectId} agentName={agent.agentName} />
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">First observed</dt>
          <dd>{agent.firstSeen?.toLocaleString() ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last known activity</dt>
          <dd>{agent.lastSeen?.toLocaleString() ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Traces in window</dt>
          <dd>{agent.current.traces.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Complete sessions</dt>
          <dd>{agent.current.completeSessions.toLocaleString()}</dd>
        </div>
      </dl>
      <AgentComparisonSparkline
        agent={agent}
        projection={projection}
        color={appearance.color}
      />
      <p className="text-muted-foreground text-xs">
        Trailing average of up to 5 complete sessions. Cohorts follow their own
        chronological progress; they are not concurrent time series.
      </p>
      {(agent.tasks.length > 0 || agent.areas.length > 0) && (
        <p className="text-muted-foreground text-xs">
          Declared context: {[...agent.tasks, ...agent.areas].join(" · ")}
        </p>
      )}
      <Link
        href={agentPath(scope, agent.agentName)}
        className="text-primary text-xs hover:underline"
      >
        Open agent profile →
      </Link>
    </div>
  );
}
