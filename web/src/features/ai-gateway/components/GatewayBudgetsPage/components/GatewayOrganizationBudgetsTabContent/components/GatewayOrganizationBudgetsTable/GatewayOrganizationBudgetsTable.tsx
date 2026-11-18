import { Pencil } from "@langfuse/icons";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { RouterOutputs } from "@/src/utils/api";
import { GatewaySpendBudgetBadge } from "@/src/features/ai-gateway/components/GatewaySpendBudgetBadge/GatewaySpendBudgetBadge";
import { gatewaySpendBudgetIntervalOptions } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import {
  getGatewaySpendLimitWindowEnd,
  getGatewaySpendLimitWindowStart,
} from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";

/** One of the organization's own budgets, with its spend in the current window. */
export type GatewayOrganizationBudgetRow =
  RouterOutputs["aiGateway"]["listOrganizationSpendLimits"][number];

type GatewayOrganizationBudgetsTableProps = Pick<
  TableProps<GatewayOrganizationBudgetRow>,
  "data"
> & {
  onEditBudget: (row: GatewayOrganizationBudgetRow) => void;
};

const intervalLabels = new Map(
  gatewaySpendBudgetIntervalOptions.map(({ value, label }) => [value, label]),
);

const columns: LangfuseColumnDef<GatewayOrganizationBudgetRow>[] = [
  createTableColumn<
    GatewayOrganizationBudgetRow,
    GatewayOrganizationBudgetRow["spendLimit"]
  >({
    accessorFn: (row) => row.spendLimit,
    id: "budget",
    header: "Budget",
    enableResizing: false,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (_, { row }) => (
      <GatewaySpendBudgetBadge
        subject="organization"
        spendLimit={row.original.spendLimit}
        spentUsd={row.original.spentUsd}
        format="amounts"
      />
    ),
  }),
  createTextTableColumn<GatewayOrganizationBudgetRow>({
    accessorFn: (row) => intervalLabels.get(row.spendLimit.interval),
    id: "resets",
    header: "Resets",
    enableResizing: false,
  }),
  createDateTableColumn<GatewayOrganizationBudgetRow>({
    accessorFn: (row) =>
      getGatewaySpendLimitWindowEnd(
        row.spendLimit.interval,
        getGatewaySpendLimitWindowStart(row.spendLimit.interval),
      ) ?? undefined,
    id: "nextReset",
    header: "Next reset",
    mode: "relative",
    enableResizing: false,
  }),
];

/** The organization's own budgets, at most one per interval. */
export function GatewayOrganizationBudgetsTable({
  data,
  onEditBudget,
}: GatewayOrganizationBudgetsTableProps) {
  const getRowActions = (row: GatewayOrganizationBudgetRow) => [
    {
      id: "editBudget",
      type: "item" as const,
      title: "Edit budget",
      icon: Pencil,
      onClick: () => onEditBudget(row),
    },
  ];

  return (
    <SettingsTable
      tableName="gatewayOrganizationBudgets"
      columns={columns}
      data={data}
      actions={getRowActions}
      noResultsMessage="No organization budgets yet."
    />
  );
}
