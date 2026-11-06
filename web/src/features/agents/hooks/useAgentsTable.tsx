import { useMemo } from "react";
import { type AgentScope, type AgentSummary } from "@langfuse/shared/agents";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { agentCost, agentDuration, agentProfilePath } from "./agentsQuery";

export function useAgentsTable(scope: AgentScope) {
  const { projectId, environment, environmentFilter } = scope;
  const from = scope.from.getTime();
  const to = scope.to.getTime();
  const columns = useMemo(
    () => [
      createLinkTableColumn<AgentSummary>({
        id: "name",
        accessorFn: (agent) => agent.displayName,
        header: "Agent",
        size: 260,
        enableSorting: true,
        getCell: (name, { row }) => ({
          type: "link",
          props: {
            value: name ?? row.original.identity.value,
            path: agentProfilePath(
              {
                projectId,
                from: new Date(from),
                to: new Date(to),
                environment,
                environmentFilter,
              },
              row.original.identity,
            ),
          },
        }),
      }),
      createTextTableColumn<AgentSummary>({
        accessorKey: "id",
        header: "ID",
        nullValue: "Not recorded",
        size: 230,
        enableHiding: true,
        defaultHidden: true,
        trailingAction: { type: "copy-to-clipboard" },
      }),
      createTextTableColumn<AgentSummary>({
        id: "environments",
        accessorFn: (agent) => agent.environments.join(", "),
        header: "Environments",
        size: 170,
        enableHiding: true,
      }),
      createNumberTableColumn<AgentSummary>({
        id: "runs",
        accessorFn: (agent) => agent.stats.runs,
        header: "Invocations",
        formatter: (value) => value.toLocaleString("en-US"),
        size: 120,
        enableSorting: true,
        enableHiding: true,
        headerTooltip: {
          description:
            "Individual executions of this agent recorded in the selected period.",
        },
      }),
      createNumberTableColumn<AgentSummary>({
        id: "traces",
        accessorFn: (agent) => agent.stats.traces,
        header: "Traces",
        formatter: (value) => value.toLocaleString("en-US"),
        size: 100,
        enableHiding: true,
      }),
      createNumberTableColumn<AgentSummary>({
        id: "cost",
        accessorFn: (agent) => agent.stats.cost,
        header: "Model cost",
        size: 140,
        enableSorting: true,
        enableHiding: true,
        emptyValue: "Unknown",
        formatter: agentCost,
        headerTooltip: {
          description:
            "Recorded model cost attributed to this agent. Data coverage is available in the agent’s Info tab.",
        },
      }),
      createNumberTableColumn<AgentSummary>({
        id: "tokens",
        accessorFn: (agent) => agent.stats.totalTokens,
        header: "Tokens",
        formatter: (value) => value.toLocaleString("en-US"),
        size: 125,
        enableHiding: true,
        emptyValue: "Unknown",
      }),
      createTextTableColumn<AgentSummary, number>({
        id: "duration",
        accessorFn: (agent) => agent.stats.averageRunDurationMs,
        header: "Average duration",
        headerTooltip: {
          description: "Average recorded duration of this agent's invocations.",
        },
        size: 155,
        enableHiding: true,
        mapValue: (value) => agentDuration(value ?? null),
      }),
      createDateTableColumn<AgentSummary>({
        accessorKey: "lastSeen",
        header: "Last seen",
        size: 190,
        enableSorting: true,
        enableHiding: true,
      }),
    ],
    [projectId, from, to, environment, environmentFilter],
  );
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    "agentsColumns",
    columns,
  );
  const [columnOrder, setColumnOrder] = useColumnOrder(
    "agentsColumnOrder",
    columns,
  );
  return {
    columns,
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
  };
}
