import type { ComponentProps } from "react";

import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createDropdownTableColumn } from "@/src/components/design-system/table/columns/createDropdownTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableToolbar,
  type MultiSelect,
} from "@/src/components/table/data-table-toolbar";
import type { TableSelectionStoreLike } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  GATEWAY_BUDGET_STATUSES,
  type GatewayBudgetStatus,
} from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { GatewaySpendBudgetBadge } from "@/src/features/ai-gateway/components/GatewaySpendBudgetBadge/GatewaySpendBudgetBadge";
import {
  getGatewaySpendLimitWindowEnd,
  getGatewaySpendLimitWindowStart,
} from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";
import {
  type GatewaySpendBudgetInterval,
  gatewaySpendBudgetIntervalOptions,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";

type GatewayBudgetUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type GatewayBudgetRow = {
  /** The key or user id; rows are selected by it. */
  id: string;
  /** The key or user the budget caps. */
  subjectId: string;
  name: string;
  /** The key's user, or the budgeted user; null for service account keys. */
  user: GatewayBudgetUser | null;
  /** Null when the key or user has no budget. */
  spendLimit: { interval: GatewaySpendBudgetInterval; limitUsd: number } | null;
  /** Spend in the current window; absent while spend is not recorded. */
  spentUsd?: number;
  isEditable: boolean;
};

type GatewayBudgetsTableProps = Pick<
  ComponentProps<typeof DataTable<GatewayBudgetRow, unknown>>,
  "data" | "onRowClick" | "pagination"
> & {
  tab: GatewaySpendTab;
  search: { value: string; onChange: (value: string) => void };
  status: {
    value: GatewayBudgetStatus;
    onChange: (value: GatewayBudgetStatus) => void;
  };
  /** Selects rows for the spend chart and bulk changes. */
  selectColumn: LangfuseColumnDef<GatewayBudgetRow>;
  selectionStore: TableSelectionStoreLike;
  multiSelect: MultiSelect;
  onEditBudget: (row: GatewayBudgetRow) => void;
};

const statusOptions: { value: GatewayBudgetStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "budgeted", label: "With budget" },
  { value: "unlimited", label: "Unlimited" },
  { value: "exceeded", label: "Exceeded" },
];

const budgetSkeleton = <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />;

const intervalLabels = new Map(
  gatewaySpendBudgetIntervalOptions.map(({ value, label }) => [value, label]),
);

const budgetColumn = (subject: "key" | "user") =>
  createTableColumn<GatewayBudgetRow, GatewayBudgetRow["spendLimit"]>({
    accessorFn: (row) => row.spendLimit,
    id: "budget",
    header: "Budget",
    size: 200,
    enableResizing: false,
    loadingCell: budgetSkeleton,
    renderCell: (spendLimit, { row }) =>
      spendLimit ? (
        <GatewaySpendBudgetBadge
          subject={subject}
          spendLimit={spendLimit}
          spentUsd={row.original.spentUsd}
          format="amounts"
        />
      ) : (
        <span className="text-muted-foreground font-mono text-xs">
          Unlimited
        </span>
      ),
  });

const resetsColumn = createTextTableColumn<GatewayBudgetRow>({
  accessorFn: (row) =>
    row.spendLimit ? intervalLabels.get(row.spendLimit.interval) : undefined,
  id: "resets",
  header: "Resets",
  hideBelowMd: true,
  enableResizing: false,
});

const nextResetColumn = createDateTableColumn<GatewayBudgetRow>({
  accessorFn: (row) =>
    row.spendLimit
      ? (getGatewaySpendLimitWindowEnd(
          row.spendLimit.interval,
          getGatewaySpendLimitWindowStart(row.spendLimit.interval),
        ) ?? undefined)
      : undefined,
  id: "nextReset",
  header: "Next reset",
  mode: "relative",
  hideBelowMd: true,
  enableResizing: false,
});

const userColumn = createUserTableColumn<GatewayBudgetRow>({
  accessorFn: (row) => row.user,
  id: "user",
  header: "User",
  variant: "avatar",
  nullValue: "Service account",
  sensitive: true,
  enableResizing: false,
});

const columnsByTab: Record<
  GatewaySpendTab,
  LangfuseColumnDef<GatewayBudgetRow>[]
> = {
  apiKeys: [
    createTextTableColumn<GatewayBudgetRow>({
      accessorFn: (row) => row.name,
      id: "key",
      header: "Key",
      sensitive: true,
      enableResizing: false,
    }),
    userColumn,
    budgetColumn("key"),
    resetsColumn,
    nextResetColumn,
  ],
  users: [userColumn, budgetColumn("user"), resetsColumn, nextResetColumn],
};

const notEditableReasons = {
  users: "Only gateway admins can change user budgets.",
  apiKeys: "A gateway admin set this budget, so only an admin can change it.",
} as const satisfies Record<GatewaySpendTab, string>;

const copyByTab = {
  apiKeys: {
    searchField: "Key or user",
    noBudgets: "No gateway keys yet.",
    noMatches: "No keys match the current filters.",
  },
  users: {
    searchField: "User",
    noBudgets: "No gateway users yet.",
    noMatches: "No users match the current filters.",
  },
} as const satisfies Record<GatewaySpendTab, Record<string, string>>;

/** Gateway keys or users with their budgets; selected rows filter the spend chart. */
export function GatewayBudgetsTable({
  tab,
  data,
  onRowClick,
  pagination,
  search,
  status,
  selectColumn,
  selectionStore,
  multiSelect,
  onEditBudget,
}: GatewayBudgetsTableProps) {
  const copy = copyByTab[tab];
  const isFiltered = search.value.trim().length > 0 || status.value !== "all";
  const tableName =
    tab === "apiKeys" ? "gatewayKeyBudgets" : "gatewayUserBudgets";
  const columns = [
    selectColumn,
    ...columnsByTab[tab],
    actionsColumn(tab, onEditBudget),
  ];

  const handleStatusChange = (value: string) =>
    status.onChange(toGatewayBudgetStatus(value));

  return (
    <>
      <DataTableToolbar
        tableName={tableName}
        columns={columns}
        searchConfig={{
          updateQuery: search.onChange,
          currentQuery: search.value,
          tableAllowsFullTextSearch: false,
          metadataSearchFields: [copy.searchField],
        }}
        currentSearchQuery={search.value}
        actionButtons={
          <div className="w-36">
            <SelectInput
              aria-label="Status"
              placeholder="All"
              value={status.value}
              onValueChange={handleStatusChange}
              options={statusOptions}
            />
          </div>
        }
        multiSelect={multiSelect}
      />
      <DataTable
        tableName={tableName}
        columns={columns}
        data={data}
        onRowClick={onRowClick}
        selectionStore={selectionStore}
        highlightAllRows={multiSelect.selectAll}
        pagination={pagination}
        noResultsMessage={isFiltered ? copy.noMatches : copy.noBudgets}
      />
    </>
  );
}

function actionsColumn(
  tab: GatewaySpendTab,
  onEditBudget: (row: GatewayBudgetRow) => void,
) {
  return createDropdownTableColumn<GatewayBudgetRow, string>({
    id: "actions",
    accessorFn: (row) => row.id,
    header: "",
    size: 48,
    enableResizing: false,
    renderMenu: (_, { row }) => (
      <DropdownMenuItem
        disabled={!row.original.isEditable}
        title={row.original.isEditable ? undefined : notEditableReasons[tab]}
        onSelect={() => onEditBudget(row.original)}
      >
        Edit budget
      </DropdownMenuItem>
    ),
  });
}

function toGatewayBudgetStatus(value: string): GatewayBudgetStatus {
  return GATEWAY_BUDGET_STATUSES.find((status) => status === value) ?? "all";
}
