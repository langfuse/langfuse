import { type OrderByState } from "@langfuse/shared";
import { type AgentSummary } from "@langfuse/shared/agents";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { type useAgentsTable } from "../hooks/useAgentsTable";

export function AgentsTable({
  table,
  data,
  orderBy,
  setOrderBy,
}: {
  table: ReturnType<typeof useAgentsTable>;
  data: AsyncTableData<AgentSummary[]>;
  orderBy: OrderByState;
  setOrderBy: (orderBy: OrderByState) => void;
}) {
  return (
    <Table
      tableName="Agents"
      rowHeight="s"
      columns={table.columns}
      data={data}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      columnVisibility={table.columnVisibility}
      onColumnVisibilityChange={table.setColumnVisibility}
      columnOrder={table.columnOrder}
      onColumnOrderChange={table.setColumnOrder}
    />
  );
}
