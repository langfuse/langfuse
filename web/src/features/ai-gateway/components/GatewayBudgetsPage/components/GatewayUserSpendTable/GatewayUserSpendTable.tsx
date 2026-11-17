import { Pencil } from "@langfuse/icons";

import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { GatewayUserSpendRow } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayUserSpend";
import { GatewaySpendBudgetBadge } from "@/src/features/ai-gateway/components/GatewaySpendBudgetBadge/GatewaySpendBudgetBadge";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { centCostFormatter } from "@/src/utils/numbers";

type GatewayUserBudgetRow = GatewayUserSpendRow & {
  /** Absent until the budgets query resolves; null for a user without a budget. */
  spendLimit?: {
    interval: GatewaySpendBudgetInterval;
    limitUsd: number;
  } | null;
  /** Spend against `spendLimit` in its current window; absent while spend is not recorded. */
  budgetSpentUsd?: number;
};

type GatewayUserSpendTableProps = Pick<
  TableProps<GatewayUserBudgetRow>,
  "data" | "onRowClick" | "selectedRowId"
> &
  Pick<SettingsTableProps<GatewayUserBudgetRow>, "toolbarActions"> & {
    pagination: PaginationBarProps;
    search: { value: string; onChange: (value: string) => void };
    /** Only gateway managers may set budgets; absent for everyone else. */
    onEditBudget?: (row: GatewayUserBudgetRow) => void;
  };

const budgetSkeleton = <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />;

const columns: LangfuseColumnDef<GatewayUserBudgetRow>[] = [
  createTextTableColumn<GatewayUserBudgetRow>({
    accessorFn: (row) => row.name,
    id: "user",
    header: "User",
    sensitive: true,
    enableResizing: false,
  }),
  createTextTableColumn<GatewayUserBudgetRow>({
    accessorFn: (row) => row.email,
    id: "email",
    header: "Email",
    nullValue: "-",
    sensitive: true,
    hideBelowMd: true,
    enableResizing: false,
  }),
  createNumberTableColumn<GatewayUserBudgetRow>({
    accessorFn: (row) => row.spendUsd,
    id: "spend",
    header: "Spend",
    formatter: centCostFormatter,
    enableResizing: false,
  }),
  createTableColumn<GatewayUserBudgetRow, GatewayUserBudgetRow["spendLimit"]>({
    accessorFn: (row) => row.spendLimit,
    id: "budget",
    header: "Budget",
    size: 200,
    hideBelowMd: true,
    enableResizing: false,
    loadingCell: budgetSkeleton,
    renderCell: (spendLimit, { row }) => {
      if (spendLimit === undefined) return budgetSkeleton;
      if (spendLimit === null) {
        return <span className="text-muted-foreground">No budget</span>;
      }
      return (
        <GatewaySpendBudgetBadge
          subject="user"
          spendLimit={spendLimit}
          spentUsd={row.original.budgetSpentUsd}
        />
      );
    },
  }),
];

export function GatewayUserSpendTable({
  data,
  onRowClick,
  selectedRowId,
  pagination,
  search,
  onEditBudget,
  toolbarActions,
}: GatewayUserSpendTableProps) {
  const hasSearch = search.value.trim().length > 0;

  return (
    <SettingsTable
      tableName="gatewayUserSpend"
      columns={columns}
      data={data}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      actions={
        onEditBudget
          ? (row) => [
              {
                id: "editBudget",
                type: "item",
                title: row.spendLimit ? "Edit budget" : "Set budget",
                icon: Pencil,
                disabled:
                  row.spendLimit === undefined
                    ? { reason: "The budget is still loading." }
                    : undefined,
                onClick: () => onEditBudget(row),
              },
            ]
          : undefined
      }
      pagination={pagination}
      toolbarActions={toolbarActions}
      search={{ ...search, placeholder: "Search by name or email" }}
      noResultsMessage={
        hasSearch ? "No users match the current search." : "No users found."
      }
    />
  );
}
