import { useMemo } from "react";
import { type OrderByState } from "@langfuse/shared";
import { type AgentScope, type AgentSummary } from "@langfuse/shared/agents";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/DataTableColumnVisibilityFilter";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import {
  agentCost,
  agentDuration,
  agentProfilePath,
} from "../hooks/agentsQuery";

export function AgentsTable({
  scope,
  data,
  orderBy,
  setOrderBy,
}: {
  scope: AgentScope;
  data: AsyncTableData<AgentSummary[]>;
  orderBy: OrderByState;
  setOrderBy: (orderBy: OrderByState) => void;
}) {
  const { projectId, environment } = scope;
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
    [projectId, from, to, environment],
  );
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    "agentsColumns",
    columns,
  );
  const [columnOrder, setColumnOrder] = useColumnOrder(
    "agentsColumnOrder",
    columns,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-end px-4 pb-2">
        <DataTableColumnVisibilityFilter
          tableName="agents"
          isV4
          columns={columns}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
        />
      </div>
      <Table
        tableName="Agents"
        rowHeight="s"
        columns={columns}
        data={data}
        orderBy={orderBy}
        setOrderBy={setOrderBy}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
      />
    </div>
  );
}
