import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayUserSpendRow } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayUserSpend";
import { centCostFormatter } from "@/src/utils/numbers";

type GatewayUserSpendTableProps = Pick<
  TableProps<GatewayUserSpendRow>,
  "data" | "onRowClick" | "selectedRowId"
> & {
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
};

const columns: LangfuseColumnDef<GatewayUserSpendRow>[] = [
  createTextTableColumn<GatewayUserSpendRow>({
    accessorFn: (row) => row.name,
    id: "user",
    header: "User",
    sensitive: true,
    enableResizing: false,
  }),
  createTextTableColumn<GatewayUserSpendRow>({
    accessorFn: (row) => row.email,
    id: "email",
    header: "Email",
    nullValue: "-",
    sensitive: true,
    hideBelowMd: true,
    enableResizing: false,
  }),
  createNumberTableColumn<GatewayUserSpendRow>({
    accessorFn: (row) => row.spendUsd,
    id: "spend",
    header: "Spend",
    formatter: centCostFormatter,
    enableResizing: false,
  }),
];

export function GatewayUserSpendTable({
  data,
  onRowClick,
  selectedRowId,
  pagination,
  search,
}: GatewayUserSpendTableProps) {
  const hasSearch = search.value.trim().length > 0;

  return (
    <SettingsTable
      tableName="gatewayUserSpend"
      columns={columns}
      data={data}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      pagination={pagination}
      search={{ ...search, placeholder: "Search by name or email" }}
      noResultsMessage={
        hasSearch
          ? "No users match the current search."
          : "No spend by users with a gateway key in this time range."
      }
    />
  );
}
