import { Pencil } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { GatewayBudgetStatus } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { GatewaySpendBudgetBadge } from "@/src/features/ai-gateway/components/GatewaySpendBudgetBadge/GatewaySpendBudgetBadge";
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
  TableProps<GatewayBudgetRow>,
  "data" | "onRowClick"
> & {
  tab: GatewaySpendTab;
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
  status: {
    value: GatewayBudgetStatus;
    onChange: (value: GatewayBudgetStatus) => void;
  };
  /** Selects rows for the spend chart and bulk changes. */
  selectColumn: LangfuseColumnDef<GatewayBudgetRow>;
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
        <Badge color="ghost" size="md" text="Unlimited" />
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
  ],
  users: [userColumn, budgetColumn("user"), resetsColumn],
};

const copyByTab = {
  apiKeys: {
    searchPlaceholder: "Search keys",
    noBudgets: "No gateway keys yet.",
    noMatches: "No keys match the current filters.",
  },
  users: {
    searchPlaceholder: "Search users",
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
  onEditBudget,
}: GatewayBudgetsTableProps) {
  const copy = copyByTab[tab];
  const isFiltered = search.value.trim().length > 0 || status.value !== "all";

  return (
    <SettingsTable
      tableName={tab === "apiKeys" ? "gatewayKeyBudgets" : "gatewayUserBudgets"}
      columns={[selectColumn, ...columnsByTab[tab]]}
      data={data}
      onRowClick={onRowClick}
      actions={(row) => [
        {
          id: "editBudget",
          type: "item",
          title: "Edit budget",
          icon: Pencil,
          disabled: row.isEditable
            ? undefined
            : {
                reason:
                  tab === "users"
                    ? "Only gateway admins can change user budgets."
                    : "A gateway admin set this budget, so only an admin can change it.",
              },
          onClick: () => onEditBudget(row),
        },
      ]}
      pagination={pagination}
      search={{ ...search, placeholder: copy.searchPlaceholder }}
      filters={[
        {
          id: "status",
          type: "select",
          label: "Status",
          placeholder: "All budgets",
          options: statusOptions,
          value: status.value,
          onChange: (value) =>
            status.onChange(value === "exceeded" ? "exceeded" : "all"),
          muted: status.value === "all",
        },
      ]}
      noResultsMessage={isFiltered ? copy.noMatches : copy.noBudgets}
    />
  );
}
