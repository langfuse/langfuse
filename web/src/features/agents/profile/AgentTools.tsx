import {
  type AgentProjectionTool,
  type AgentSessionProjection,
} from "@langfuse/shared";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { Badge } from "@/src/components/design-system/Badge/Badge";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">Observed tools</h2>
        <Badge text="Executed TOOL observations" color="filled" />
      </div>
      <p className="text-muted-foreground shrink-0 text-xs">
        Select a tool to inspect its supporting sessions.
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        <Table
          tableName="Agent tools"
          columns={columns}
          data={{ status: "success", data: tools }}
          rowHeight="s"
          onRowClick={(tool) => onSelectTool(tool.name)}
        />
      </div>
      {projection.coverage.groupsTruncated && (
        <p className="text-muted-foreground shrink-0 text-xs">
          Showing up to {projection.coverage.groupsLimit} tool groups per agent.
        </p>
      )}
    </div>
  );
}
