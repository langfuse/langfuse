import { Globe, KeyRound, Pencil, Trash2, User } from "@langfuse/icons";

import { TableCard } from "@/src/components/TableCard/TableCard";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { MultiSelect } from "@/src/components/table/data-table-toolbar";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GATEWAY_GUARDRAIL_ACTION_LABELS } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { GATEWAY_GUARDRAIL_PRESETS } from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import { numberFormatter } from "@/src/utils/numbers";
import { assertUnreachable } from "@/src/utils/types";

export type GatewayGuardrailsTableProps = Pick<
  TableProps<GatewayGuardrailRow>,
  "data" | "onRowClick"
> & {
  canManage: boolean;
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
  selectColumn: LangfuseColumnDef<GatewayGuardrailRow>;
  multiSelect: MultiSelect;
  onEditGuardrail: (row: GatewayGuardrailRow) => void;
  onDeleteGuardrail: (row: GatewayGuardrailRow) => void;
};

type GuardrailAssignment = GatewayGuardrailRow["assignments"][number];

const guardrailCellSkeleton = (
  <div className="flex items-center gap-2.5">
    <Skeleton className="size-6 shrink-0 rounded-md" />
    <Skeleton className="h-3.5 w-32" />
  </div>
);

const guardrailColumn = createTableColumn<
  GatewayGuardrailRow,
  GatewayGuardrailRow["name"]
>({
  accessorFn: (row) => row.name,
  id: "guardrail",
  header: "Guardrail",
  size: 280,
  enableResizing: false,
  loadingCell: guardrailCellSkeleton,
  renderCell: (_name, { row }) => (
    <div className="ph-no-capture flex min-w-0 items-center gap-2.5">
      <span className="bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold">
        {getGuardrailBadge(row.original)}
      </span>
      <span
        className="text-foreground truncate text-sm font-medium"
        title={row.original.name}
      >
        {row.original.name}
      </span>
    </div>
  ),
});

const runsOnColumn = createTextTableColumn<GatewayGuardrailRow>({
  accessorFn: () => "Input",
  id: "runsOn",
  header: "Runs on",
  size: 110,
  hideBelowMd: true,
  enableResizing: false,
});

const onMatchColumn = createTextTableColumn<GatewayGuardrailRow>({
  accessorFn: (row) => GATEWAY_GUARDRAIL_ACTION_LABELS[row.action],
  id: "onMatch",
  header: "On match",
  size: 110,
  enableResizing: false,
});

const appliesToColumn = createBadgeListTableColumn<
  GatewayGuardrailRow,
  GuardrailAssignment
>({
  accessorFn: (row) => row.assignments,
  id: "appliesTo",
  header: "Applies to",
  size: 260,
  sensitive: true,
  enableResizing: false,
  getBadge: (assignment) => {
    switch (assignment.scope) {
      case "ORGANIZATION":
        return {
          key: assignment.id,
          value: assignment.label,
          icon: Globe,
          variant: "secondary",
        };
      case "USER":
        return {
          key: assignment.id,
          value: assignment.label ?? "User",
          icon: User,
          variant: "secondary",
        };
      case "API_KEY":
        return {
          key: assignment.id,
          value: assignment.label ?? "API key",
          icon: KeyRound,
          variant: "secondary",
        };
      default:
        return assertUnreachable(assignment);
    }
  },
});

const flaggedColumn = createNumberTableColumn<GatewayGuardrailRow>({
  accessorFn: (row) => row.flaggedCount7d,
  id: "flagged7d",
  header: "Flagged 7d",
  size: 120,
  enableResizing: false,
  formatter: (value) => numberFormatter(value, 0),
});

const DATA_COLUMNS: LangfuseColumnDef<GatewayGuardrailRow>[] = [
  guardrailColumn,
  runsOnColumn,
  onMatchColumn,
  appliesToColumn,
  flaggedColumn,
];

export function GatewayGuardrailsTable({
  canManage,
  data,
  onRowClick,
  pagination,
  search,
  selectColumn,
  multiSelect,
  onEditGuardrail,
  onDeleteGuardrail,
}: GatewayGuardrailsTableProps) {
  const isFiltered = search.value.trim().length > 0;

  return (
    <TableCard
      tableName="gateway-guardrails"
      columns={[selectColumn, ...DATA_COLUMNS]}
      data={data}
      onRowClick={onRowClick}
      actions={
        canManage
          ? (row) => [
              {
                id: "editGuardrail",
                type: "item",
                title: "Edit guardrail",
                icon: Pencil,
                onClick: () => onEditGuardrail(row),
              },
              {
                id: "deleteGuardrail",
                type: "item",
                title: "Delete guardrail",
                icon: Trash2,
                variant: "destructive",
                onClick: () => onDeleteGuardrail(row),
              },
            ]
          : undefined
      }
      pagination={pagination}
      multiSelect={multiSelect}
      search={{ ...search, placeholder: "Search guardrails" }}
      noResultsMessage={
        isFiltered
          ? "No guardrails match your search."
          : "No guardrails configured yet."
      }
    />
  );
}

function getGuardrailBadge(row: GatewayGuardrailRow) {
  if (
    row.presets.length === 0 &&
    row.secretPrefixes.length === 0 &&
    row.containsWords.length > 0
  ) {
    return "Aa";
  }
  const isSecrets =
    row.secretPrefixes.length > 0 ||
    (row.presets.length > 0 &&
      row.presets.every(
        (preset) => GATEWAY_GUARDRAIL_PRESETS[preset].group === "secrets",
      ));
  return isSecrets ? "***" : "PII";
}
