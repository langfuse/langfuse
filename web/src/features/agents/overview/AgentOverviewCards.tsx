import Link from "next/link";
import { ArrowUpRight, CircleAlert, Moon } from "lucide-react";
import { type AgentSessionProjection } from "@langfuse/shared";
import { Table } from "@/src/components/design-system/table/Table";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
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
  showAttention?: boolean;
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
function AgentCard({
  agent,
  scope,
  metrics,
  projection,
  showAttention = true,
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
        {showAttention && agent.signals.length > 0 ? (
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
  const columns = [
    createTableColumn<OverviewAgent, string>({
      accessorKey: "agentName",
      header: "Agent",
      size: 280,
      loadingCell: null,
      cellClassName: "ph-no-capture",
      renderCell: (name, { row }) => (
        <div className="flex items-center gap-2">
          <AgentAppearancePicker
            projectId={scope.projectId}
            agentName={row.original.agentName}
          />
          <HoverCard
            content={
              <AgentPreview
                agent={row.original}
                scope={scope}
                projection={projection}
              />
            }
          >
            {({ getTriggerProps }) => (
              <Link
                {...getTriggerProps()}
                title={name ?? undefined}
                href={agentPath(scope, row.original.agentName)}
                className="max-w-72 min-w-0 truncate font-bold hover:underline"
              >
                {name}
              </Link>
            )}
          </HoverCard>
        </div>
      ),
    }),
    ...metrics.map((metric) =>
      createNumberTableColumn<OverviewAgent>({
        id: metric,
        accessorFn: (agent) => metricValue(agent, metric),
        header: METRIC_LABELS[metric],
        size: 130,
        formatter: (value) => formatMetric(metric, value),
      }),
    ),
    createTableColumn<OverviewAgent, string>({
      accessorKey: "state",
      header: "Activity",
      size: 180,
      loadingCell: null,
      cellClassName: "ph-no-capture",
      renderCell: (_, { row: { original: agent } }) => (
        <Link
          href={agentPath(scope, agent.agentName, {
            tab: "sessions",
            ...(agent.signals[0] ? { agentSignal: agent.signals[0].kind } : {}),
          })}
          className={
            agent.signals.length
              ? "text-amber-600 hover:underline dark:text-amber-400"
              : "text-muted-foreground hover:underline"
          }
        >
          {activityStatus(agent)}
        </Link>
      ),
    }),
  ];
  return (
    <div className="ph-no-capture min-h-64 overflow-hidden rounded-lg border">
      <Table
        tableName="Agent overview"
        columns={columns}
        data={{ status: "success", data: agents }}
        rowHeight="l"
      />
    </div>
  );
}

function activityStatus(agent: OverviewAgent): string {
  if (agent.signals.length) return `${agent.signals.length} to inspect`;
  return agent.state === "dormant" ? "Dormant" : "Active";
}
