import Link from "next/link";
import { Table } from "@/src/components/design-system/table/Table";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { AgentAppearancePicker } from "../appearance";
import { AgentPreview } from "./AgentPreview";
import {
  agentPath,
  formatMetric,
  METRIC_LABELS,
  metricValue,
  type OverviewAgent,
  type AgentOverviewListProps,
} from "./prepareOverview";

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
