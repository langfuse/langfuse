import { Pencil, Trash2 } from "@langfuse/icons";

import { TableCard } from "@/src/components/TableCard/TableCard";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { TableProps } from "@/src/components/design-system/table/Table";
import type { MultiSelect } from "@/src/components/table/data-table-toolbar";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GATEWAY_GUARDRAIL_ACTION_LABELS } from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import { formatGuardrailAssignments } from "@/src/features/ai-gateway/fns/formatGuardrailAssignments";
import { formatGuardrailPresetsSummary } from "@/src/features/ai-gateway/fns/formatGuardrailPresetsSummary";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import { numberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

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

const guardrailCellSkeleton = (
  <div className="flex items-center gap-2.5">
    <Skeleton className="size-7 shrink-0 rounded-md" />
    <div className="flex flex-col gap-1">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3 w-40" />
    </div>
  </div>
);

const appliesToSkeleton = <Skeleton className="h-4 w-24" />;

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
  renderCell: (_name, { row }) => {
    const summary = formatGuardrailPresetsSummary({
      presets: row.original.presets,
      secretPrefixes: row.original.secretPrefixes,
      containsWords: row.original.containsWords,
    });
    return (
      <div className="ph-no-capture flex min-w-0 items-center gap-2.5 py-0.5">
        <span className="bg-muted text-foreground flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold">
          {summary.badge}
        </span>
        <div className="flex min-w-0 flex-col">
          <span
            className="text-foreground truncate text-sm font-medium"
            title={row.original.name}
          >
            {row.original.name}
          </span>
          <span
            className="text-muted-foreground truncate text-xs"
            title={summary.subtitle}
          >
            {summary.subtitle}
          </span>
        </div>
      </div>
    );
  },
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

const appliesToColumn = createTableColumn<
  GatewayGuardrailRow,
  GatewayGuardrailRow["assignments"]
>({
  accessorFn: (row) => row.assignments,
  id: "appliesTo",
  header: "Applies to",
  size: 220,
  enableResizing: false,
  loadingCell: appliesToSkeleton,
  renderCell: (assignments) => {
    const formatted = formatGuardrailAssignments(assignments ?? []);
    return (
      <div className="ph-no-capture flex min-w-0 flex-col">
        <span
          className={cn(
            "truncate text-sm",
            formatted.muted ? "text-muted-foreground" : "text-foreground",
          )}
          title={formatted.primary}
        >
          {formatted.primary}
        </span>
        {formatted.secondary ? (
          <span
            className="text-muted-foreground truncate text-xs"
            title={formatted.secondary}
          >
            {formatted.secondary}
          </span>
        ) : null}
      </div>
    );
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
