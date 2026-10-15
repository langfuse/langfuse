import {
  type AgentProjectionTool,
  type AgentSessionProjection,
} from "@langfuse/shared";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { BarChart } from "@/src/components/design-system/charts/BarChart/BarChart";

export function AgentTools({
  agentName,
  projection,
  onSelectTool,
}: {
  agentName: string;
  projection: AgentSessionProjection;
  onSelectTool: (name: string) => void;
}) {
  const tools = projection.tools.filter((tool) => tool.agentName === agentName);
  const columns = [
    createTextTableColumn<AgentProjectionTool>({
      accessorKey: "name",
      header: "Tool",
      size: 260,
      cellClassName: "ph-no-capture",
    }),
    createNumberTableColumn<AgentProjectionTool>({
      accessorKey: "invocations",
      header: "Executed calls",
      size: 130,
    }),
    createNumberTableColumn<AgentProjectionTool>({
      accessorKey: "sessions",
      header: "Sessions",
      size: 110,
    }),
    createNumberTableColumn<AgentProjectionTool>({
      accessorKey: "traces",
      header: "Traces",
      size: 100,
    }),
    createDateTableColumn<AgentProjectionTool>({
      accessorKey: "lastUsed",
      header: "Last used",
      size: 180,
    }),
  ];
  const top = [...tools]
    .sort((a, b) => b.invocations - a.invocations)
    .slice(0, 8);
  const chart = top.map((tool) => ({
    label: tool.name,
    value: tool.invocations,
  }));
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold">Observed tools</h2>
        <Badge text="Executed TOOL observations" color="filled" />
      </div>
      <p className="text-muted-foreground text-sm">
        Includes skill-loading tools. Model tool-call requests are not added to
        executed calls. Available tools require explicit definition evidence.
      </p>
      {chart.length > 0 && (
        <div className="ph-no-capture h-40">
          <BarChart
            data={chart}
            ariaLabel="Most frequently executed tools"
            tooltipValueLabel="Executed calls"
          />
        </div>
      )}
      <Table
        tableName="Agent tools"
        columns={columns}
        data={{ status: "success", data: tools }}
        rowHeight="m"
        onRowClick={(tool) => onSelectTool(tool.name)}
      />
      {tools.some((tool) => tool.available) && (
        <p className="text-muted-foreground text-xs">
          Explicitly declared available:{" "}
          <span className="ph-no-capture">
            {tools
              .filter((tool) => tool.available)
              .map((tool) => tool.name)
              .join(", ")}
          </span>
          .
        </p>
      )}
      {projection.coverage.groupsTruncated && (
        <p className="text-muted-foreground text-xs">
          Showing up to {projection.coverage.groupsLimit} tool groups per agent.
        </p>
      )}
    </div>
  );
}
