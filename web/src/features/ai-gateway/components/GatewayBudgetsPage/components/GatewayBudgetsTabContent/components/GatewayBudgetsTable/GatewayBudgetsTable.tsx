import { Ban, ListTree, Pencil, RotateCcw } from "@langfuse/icons";

import {
  TableCard,
  type TableCardProps,
} from "@/src/components/TableCard/TableCard";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { MultiSelect } from "@/src/components/table/data-table-toolbar";
import type { RouterOutputs } from "@/src/utils/api";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  GATEWAY_BUDGET_STATUSES,
  type GatewayBudgetStatus,
} from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import {
  GATEWAY_ADMIN_SET_BUDGET_CHANGE_REASON,
  GATEWAY_ADMIN_SET_BUDGET_RESET_REASON,
  GATEWAY_ADMIN_SET_BUDGET_SHORT_REASON,
} from "@/src/features/ai-gateway/constants/gatewayAdminSetBudgetReasons";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { buildGatewayTracesHref } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayTracesHref";
import { GatewayDefaultBudgetTag } from "@/src/features/ai-gateway/components/GatewayDefaultBudgetTag/GatewayDefaultBudgetTag";
import { GatewaySpendBudgetBadge } from "@/src/features/ai-gateway/components/GatewaySpendBudgetBadge/GatewaySpendBudgetBadge";
import {
  getGatewaySpendLimitWindowEnd,
  getGatewaySpendLimitWindowStart,
} from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";
import { gatewaySpendBudgetIntervalOptions } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";

/** One key or user with its budget, if any, as the server lists them. */
export type GatewayBudgetRow =
  RouterOutputs["aiGateway"]["listBudgets"]["rows"][number];

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
  multiSelect: MultiSelect;
  onEditBudget: (row: GatewayBudgetRow) => void;
  onResetBudget: (row: GatewayBudgetRow) => void;
  /** Configured ingestion project the user can open; hides "Show traces" when absent. */
  ingestionProjectId?: string | null;
  /** Right of the search and filter, e.g. the default budget. */
  toolbarActions?: TableCardProps<GatewayBudgetRow>["toolbarActions"];
};

const statusOptions: { value: GatewayBudgetStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "budgeted", label: "With budget" },
  { value: "default", label: "Default budget" },
  { value: "unlimited", label: "Unlimited" },
  { value: "exceeded", label: "Exceeded" },
];

/** Fits "Default budget" next to its radio dot in the open menu, which is as wide as the trigger. */
const STATUS_FILTER_MIN_WIDTH_PX = 160;

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
        <span className="inline-flex items-center gap-2">
          <GatewaySpendBudgetBadge
            subject={subject}
            spendLimit={spendLimit}
            spentUsd={row.original.spentUsd}
            format="amounts"
          />
          {row.original.isDefault && (
            <GatewayDefaultBudgetTag subject={subject} />
          )}
        </span>
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
  apiKeys: GATEWAY_ADMIN_SET_BUDGET_CHANGE_REASON,
} as const satisfies Record<GatewaySpendTab, string>;

const noBudgetResetReasons = {
  users: "This user has no budget to reset.",
  apiKeys: "This key has no budget to reset.",
} as const satisfies Record<GatewaySpendTab, string>;

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
  multiSelect,
  onEditBudget,
  onResetBudget,
  ingestionProjectId,
  toolbarActions,
}: GatewayBudgetsTableProps) {
  const copy = copyByTab[tab];
  const isFiltered = search.value.trim().length > 0 || status.value !== "all";
  const getRowActions = (row: GatewayBudgetRow) => [
    {
      id: "editBudget",
      type: "item" as const,
      title: "Edit budget",
      icon: Pencil,
      description:
        tab === "apiKeys" && !row.isEditable
          ? GATEWAY_ADMIN_SET_BUDGET_SHORT_REASON
          : undefined,
      disabled: row.isEditable
        ? undefined
        : { reason: notEditableReasons[tab] },
      onClick: () => onEditBudget(row),
    },
    {
      id: "resetBudget",
      type: "item" as const,
      title: "Reset budget",
      icon: isResetLockedByAdmin(row) ? Ban : RotateCcw,
      description: isResetLockedByAdmin(row)
        ? GATEWAY_ADMIN_SET_BUDGET_SHORT_REASON
        : undefined,
      disabled: getResetBudgetDisabled(row, tab),
      onClick: () => onResetBudget(row),
    },
    ...(ingestionProjectId
      ? [
          {
            id: "showTraces",
            type: "item" as const,
            title: "Show traces",
            icon: ListTree,
            href: buildGatewayTracesHref({
              projectId: ingestionProjectId,
              subject: GATEWAY_SPEND_TABS[tab].subject,
              subjectId: row.subjectId,
            }),
          },
        ]
      : []),
  ];

  return (
    <TableCard
      tableName={GATEWAY_SPEND_TABS[tab].tableName}
      columns={[selectColumn, ...columnsByTab[tab]]}
      data={data}
      onRowClick={onRowClick}
      actions={getRowActions}
      pagination={pagination}
      multiSelect={multiSelect}
      search={{ ...search, placeholder: copy.searchPlaceholder }}
      filters={[
        {
          id: "status",
          type: "select",
          label: "Status",
          placeholder: "All",
          options: statusOptions,
          value: status.value,
          onChange: (value) => status.onChange(toGatewayBudgetStatus(value)),
          muted: status.value === "all",
          minWidth: STATUS_FILTER_MIN_WIDTH_PX,
        },
      ]}
      toolbarActions={toolbarActions}
      noResultsMessage={isFiltered ? copy.noMatches : copy.noBudgets}
    />
  );
}

function getResetBudgetDisabled(row: GatewayBudgetRow, tab: GatewaySpendTab) {
  if (!row.spendLimit) return { reason: noBudgetResetReasons[tab] };
  if (!row.canResetBudget) {
    return { reason: GATEWAY_ADMIN_SET_BUDGET_RESET_REASON };
  }
  return undefined;
}

function isResetLockedByAdmin(row: GatewayBudgetRow) {
  return row.spendLimit !== null && !row.canResetBudget;
}

function toGatewayBudgetStatus(value: string): GatewayBudgetStatus {
  return GATEWAY_BUDGET_STATUSES.find((status) => status === value) ?? "all";
}
