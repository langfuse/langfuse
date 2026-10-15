import Link from "next/link";
import { ArrowUpRight, CircleAlert, Moon } from "lucide-react";
import { type AgentSessionProjection } from "@langfuse/shared";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import {
  AgentIdentity,
  AgentAppearancePicker,
  useAgentAppearance,
} from "../appearance";
import { type AgentCardMetric } from "../prototype-options/options";
import { AgentComparisonSparkline } from "./AgentComparisonSparkline";
import {
  agentPath,
  formatMetric,
  METRIC_LABELS,
  metricValue,
  type OverviewAgent,
  type OverviewScope,
} from "./prepareOverview";

export type AgentOverviewListProps = {
  scope: OverviewScope;
  agents: OverviewAgent[];
  metrics: AgentCardMetric[];
  projection: AgentSessionProjection;
};
function AgentPreview({
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
    <div className="ph-no-capture flex w-80 flex-col gap-3 p-4">
      <AgentIdentity projectId={scope.projectId} agentName={agent.agentName} />
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">First observed</dt>
          <dd>{agent.firstSeen?.toLocaleString() ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last observed</dt>
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
function AgentCard({
  agent,
  scope,
  metrics,
  projection,
}: AgentOverviewListProps & { agent: OverviewAgent }) {
  const appearance = useAgentAppearance(scope.projectId, agent.agentName);
  return (
    <article className="ph-no-capture bg-card flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-xs transition-shadow hover:shadow-md">
      <div
        className="flex items-start justify-between gap-3 border-b p-4"
        style={{
          background: `linear-gradient(120deg, ${appearance.color}18, transparent)`,
        }}
      >
        <div className="min-w-0 flex-1">
          <HoverCard
            content={
              <AgentPreview
                agent={agent}
                scope={scope}
                projection={projection}
              />
            }
            placement="right-start"
          >
            {({ getTriggerProps }) => (
              <Link
                {...getTriggerProps()}
                href={agentPath(scope, agent.agentName)}
                className="group flex min-w-0 items-center gap-2 font-bold"
              >
                <AgentIdentity
                  projectId={scope.projectId}
                  agentName={agent.agentName}
                />
                <ArrowUpRight className="icon-base text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </Link>
            )}
          </HoverCard>
          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            {agent.state === "dormant" ? (
              <>
                <Moon className="icon-base" />
                No activity in window
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Observed in window
              </>
            )}
          </div>
        </div>
        <AgentAppearancePicker
          projectId={scope.projectId}
          agentName={agent.agentName}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4">
        {metrics.map((metric) => (
          <div key={metric}>
            <dt className="text-muted-foreground text-xs">
              {METRIC_LABELS[metric]}
            </dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">
              {formatMetric(metric, metricValue(agent, metric))}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto px-4 pb-3">
        <AgentComparisonSparkline
          agent={agent}
          projection={projection}
          color={appearance.color}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-2 border-t px-4 py-2 text-xs">
        {agent.signals.length > 0 ? (
          <Link
            href={agentPath(scope, agent.agentName, {
              tab: "sessions",
              agentSignal: agent.signals[0].kind,
            })}
            className="flex items-center gap-1.5 text-amber-600 hover:underline dark:text-amber-400"
          >
            <CircleAlert className="icon-base" />
            {agent.signals.length} change{agent.signals.length === 1 ? "" : "s"}{" "}
            to inspect
          </Link>
        ) : (
          <span className="text-muted-foreground">
            {agent.comparisonStatus === "ready"
              ? "No configured signal triggered"
              : "More complete sessions needed"}
          </span>
        )}
        <Link
          className="text-muted-foreground hover:text-foreground shrink-0"
          href={agentPath(scope, agent.agentName, { tab: "sessions" })}
        >
          Sessions →
        </Link>
      </div>
    </article>
  );
}
export function AgentOverviewCards(props: AgentOverviewListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {props.agents.map((agent) => (
        <AgentCard key={agent.agentName} {...props} agent={agent} />
      ))}
    </div>
  );
}
export function AgentOverviewList({
  agents,
  scope,
  metrics,
  projection,
}: AgentOverviewListProps) {
  return (
    <div className="ph-no-capture overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="text-muted-foreground bg-muted/30 text-xs">
          <tr>
            <th className="px-4 py-3 font-medium">Agent</th>
            {metrics.map((metric) => (
              <th key={metric} className="px-4 py-3 text-right font-medium">
                {METRIC_LABELS[metric]}
              </th>
            ))}
            <th className="px-4 py-3 font-medium">Activity</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.agentName} className="hover:bg-muted/20 border-t">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <AgentAppearancePicker
                    projectId={scope.projectId}
                    agentName={agent.agentName}
                  />
                  <HoverCard
                    content={
                      <AgentPreview
                        agent={agent}
                        scope={scope}
                        projection={projection}
                      />
                    }
                  >
                    {({ getTriggerProps }) => (
                      <Link
                        {...getTriggerProps()}
                        href={agentPath(scope, agent.agentName)}
                        className="max-w-72 min-w-0 truncate font-medium hover:underline"
                      >
                        {agent.agentName}
                      </Link>
                    )}
                  </HoverCard>
                </div>
              </td>
              {metrics.map((metric) => (
                <td key={metric} className="px-4 py-3 text-right tabular-nums">
                  {formatMetric(metric, metricValue(agent, metric))}
                </td>
              ))}
              <td className="px-4 py-3">
                <Link
                  href={agentPath(scope, agent.agentName, {
                    tab: "sessions",
                    ...(agent.signals[0]
                      ? { agentSignal: agent.signals[0].kind }
                      : {}),
                  })}
                  className={
                    agent.signals.length
                      ? "text-amber-600 hover:underline dark:text-amber-400"
                      : "text-muted-foreground hover:underline"
                  }
                >
                  {agent.signals.length
                    ? `${agent.signals.length} to inspect`
                    : agent.state === "dormant"
                      ? "Dormant"
                      : "Active"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
