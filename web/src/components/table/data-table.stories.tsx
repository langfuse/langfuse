import preview from "../../../.storybook/preview";
import { useCallback, useMemo, useState } from "react";
import { fn } from "storybook/test";
import {
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { type OrderByState } from "@langfuse/shared";
import Decimal from "decimal.js";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Skeleton } from "@/src/components/ui/skeleton";
import TableLink from "@/src/components/table/table-link";
import TableIdOrName from "@/src/components/table/table-id";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import {
  LevelCountsDisplay,
  type LevelCount,
} from "@/src/components/level-counts-display";
import { formatAsLabel, LevelSymbols } from "@/src/components/level-colors";
import { StarToggle } from "@/src/components/star-toggle";
import TagList from "@/src/features/tag/components/TagList";
import { FolderBreadcrumbLink } from "@/src/features/folders/components/FolderBreadcrumbLink";
import { BreakdownTooltip } from "@/src/components/trace/components/_shared/BreakdownToolTip";
import {
  TableBadgeLoadingCell,
  TableIconButtonLoadingCell,
  TableTextLoadingCell,
} from "@/src/components/table/loading-cells";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { InfoIcon, MoreVertical, Trash } from "lucide-react";

// =============================================================================
// FIDELITY GOAL
// =============================================================================
// These stories are not hand-approximated cells — they reproduce the *real*
// table cells at the children-spacing level by reusing the exact shared
// presentational components the production tables use:
//
//   - Traces  (components/table/use-cases/traces.tsx)
//   - Prompts (features/prompts/components/prompts-table.tsx)
//
// The DataTable body (data-table.tsx) wraps every cell in a flex box whose DOM
// branch depends on (a) the accessor's *value type* — `cell.getValue()` — and
// (b) rowHeight. A plain-string accessor on rowHeight "s" gets
// `truncate leading-none`; on m/l it gets a flex column; a non-string value
// gets the raw flex box. So to match production spacing we must match BOTH the
// rendered child AND the accessor value type of each column. The rows below are
// typed exactly like the real *TableRow types so the string-vs-node branch
// fires identically (e.g. Traces `name` returns a raw string -> string branch;
// `latency` returns a number accessor with a <span> cell -> node branch).
//
// Where a real cell needs heavy runtime context (tRPC/router/peek), we render
// the standalone visual part with identical DOM/classes:
//   - bookmark:  real StarToggle (the visual half of StarTraceToggle) + local
//                state, instead of the tRPC-bound StarTraceToggle.
//   - tags:      real TagList in the real `flex gap-x-2 gap-y-1` wrapper,
//                instead of TagPromptPopover/TagManager (same visible children).
//   - actions:   real DropdownMenu + ghost MoreVertical, with a plain menu item
//                instead of the tRPC-bound DeleteTraceButton / DeletePrompt.
// Everything else (TableLink, Badge, IOTableCell, LocalIsoDate, TableIdOrName,
// TokenUsageBadge, LevelCountsDisplay, FolderBreadcrumbLink, Skeleton, the
// loading cells) is the actual production component.

// -----------------------------------------------------------------------------
// Deterministic mock data
// -----------------------------------------------------------------------------

// Deterministic pseudo-random so stories are stable across reloads.
function seeded(n: number) {
  const x = Math.sin(n + 1) * 10000;
  return x - Math.floor(x);
}

const TRACE_NAMES = [
  "checkout-agent",
  "retrieval-pipeline",
  "summarizer",
  "qa-bot",
  "classification-job",
  "embedding-batch",
  "rerank-step",
  "guardrail-eval",
];
const ENVIRONMENTS = ["production", "staging", "development"];
const USER_IDS = ["alice@acme.io", "bob@acme.io", "carol@acme.io", "system"];
const TRACE_TAG_POOL = [
  ["production", "rag"],
  ["staging"],
  [],
  ["experimental", "latency-sensitive", "reviewed"],
  ["regression"],
];

// Row type mirrors TracesTableRow (the load-bearing fields). Keeping the same
// value *types* per accessor is what makes the DataTable cell branch fire
// identically to production (string `name`, numeric `latency`, Date `timestamp`,
// Decimal `totalCost`, parsed-object input/output, etc.).
type TraceRow = {
  bookmarked: boolean;
  id: string;
  timestamp: Date;
  name: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
  levelCounts: {
    errorCount: number;
    warningCount: number;
    debugCount: number;
    defaultCount: number;
  };
  latency: number;
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  };
  tokenDetails: Record<string, number>;
  totalCost: Decimal;
  costDetails: Record<string, number>;
  environment: string;
  tags: string[];
  userId: string;
  observationCount: number;
};

function makeTraceRow(index: number): TraceRow {
  const name = TRACE_NAMES[index % TRACE_NAMES.length]!;
  const environment = ENVIRONMENTS[index % ENVIRONMENTS.length]!;
  const baseTime = Date.parse("2026-06-23T09:00:00.000Z");
  const timestamp = new Date(baseTime - index * 137_000);
  const inputUsage = Math.round(200 + seeded(index * 3) * 4000);
  const outputUsage = Math.round(100 + seeded(index * 4) * 2000);
  const totalUsage = inputUsage + outputUsage;
  const inputCost = Number((seeded(index * 2) * 0.18).toFixed(6));
  const outputCost = Number((seeded(index * 6) * 0.22).toFixed(6));
  return {
    bookmarked: index % 5 === 0,
    id: `trace-${(index + 1).toString().padStart(5, "0")}-${Math.floor(
      seeded(index) * 1e6,
    )
      .toString(16)
      .padStart(5, "0")}`,
    timestamp,
    name,
    // Parsed JS objects (NOT pre-stringified) — IOTableCell stringifies/renders
    // them itself via JSONView, exactly like the real input/output cells.
    input: {
      query: `${name} request #${index + 1}`,
      environment,
      options: { stream: index % 2 === 0, topK: 8 },
    },
    output: {
      status: index % 7 === 0 ? "error" : "success",
      tokens: totalUsage,
      citations: ["doc-12", "doc-87", "doc-204"],
    },
    metadata: {
      release: `v1.${index % 9}.0`,
      region: index % 2 === 0 ? "us-east-1" : "eu-west-1",
    },
    levelCounts: {
      errorCount: index % 7 === 0 ? 1 + (index % 3) : 0,
      warningCount: index % 4 === 0 ? 2 : 0,
      debugCount: index % 3 === 0 ? 5 : 0,
      defaultCount: 10 + (index % 12),
    },
    latency: Number((0.2 + seeded(index) * 18).toFixed(3)),
    usage: { inputUsage, outputUsage, totalUsage },
    tokenDetails: { input: inputUsage, output: outputUsage, total: totalUsage },
    totalCost: new Decimal(inputCost + outputCost),
    costDetails: {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    },
    environment,
    tags: TRACE_TAG_POOL[index % TRACE_TAG_POOL.length]!,
    userId: USER_IDS[index % USER_IDS.length]!,
    observationCount: Math.round(1 + seeded(index * 5) * 40),
  };
}

const TRACE_ROWS: TraceRow[] = Array.from({ length: 123 }, (_, i) =>
  makeTraceRow(i),
);

// -----------------------------------------------------------------------------
// Traces columns — faithful copy of the real Traces column structure
// -----------------------------------------------------------------------------
// Mirrors the visible-by-default Traces columns. The action/bookmark/selection
// cells use the standalone visual components (see FIDELITY GOAL note). The IO
// cells use the same MemoizedIOTableCell with the same bg classes + the
// `singleLine = rowHeight === "s"` rule the real table applies.

function buildTraceColumns(
  rowHeight: RowHeight,
): LangfuseColumnDef<TraceRow>[] {
  const singleLine = rowHeight === "s";
  return [
    {
      // Row-selection checkbox column (each real table authors its own; the
      // Traces table injects `selectActionColumn` here). Same 30px width slot.
      accessorKey: "select",
      id: "select",
      size: 30,
      enableSorting: false,
      isFixedPosition: true,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "bookmarked",
      header: undefined,
      id: "bookmarked",
      size: 30,
      isFixedPosition: true,
      loadingCell: <TableIconButtonLoadingCell />,
      // Visual half of StarTraceToggle (StarToggle) with local state, avoiding
      // the tRPC mutation/project-access while keeping identical DOM/classes.
      cell: ({ row }) => (
        <BookmarkCell defaultValue={row.original.bookmarked} />
      ),
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      size: 150,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.original.timestamp;
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
      enableSorting: true,
      // Returns the raw string — hits DataTable's string-cell branch exactly
      // like the real Name cell.
      cell: ({ row }) => row.original.name ?? undefined,
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 400,
      loadingCell: () => (
        <MemoizedIOTableCell
          isLoading
          data={undefined}
          className="bg-muted/50"
          singleLine={singleLine}
        />
      ),
      cell: ({ row }) => (
        <MemoizedIOTableCell
          data={row.original.input}
          className="bg-muted/50"
          singleLine={singleLine}
          enableExpandOnHover={singleLine}
        />
      ),
    },
    {
      accessorKey: "output",
      header: "Output",
      id: "output",
      size: 400,
      loadingCell: () => (
        <MemoizedIOTableCell
          isLoading
          data={undefined}
          className="bg-accent-light-green"
          singleLine={singleLine}
        />
      ),
      cell: ({ row }) => (
        <MemoizedIOTableCell
          data={row.original.output}
          className="bg-accent-light-green"
          singleLine={singleLine}
          enableExpandOnHover={singleLine}
        />
      ),
    },
    {
      accessorKey: "levelCounts",
      id: "levelCounts",
      header: "Observation Levels",
      size: 150,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value = row.original.levelCounts;
        const counts: LevelCount[] = Object.entries(value).map(
          ([level, count]) => ({
            level: formatAsLabel(level),
            count,
            symbol: LevelSymbols[formatAsLabel(level)],
          }),
        );
        return <LevelCountsDisplay counts={counts} />;
      },
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: "Latency",
      size: 100,
      enableSorting: true,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value = row.original.latency;
        return value !== undefined ? (
          <span className="text-nowrap">{formatIntervalSeconds(value)}</span>
        ) : undefined;
      },
    },
    {
      accessorKey: "tokens",
      header: "Tokens",
      id: "tokens",
      size: 180,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const value = row.original.usage;
        if (!value.inputUsage && !value.outputUsage && !value.totalUsage) {
          return null;
        }
        return (
          <BreakdownTooltip details={row.original.tokenDetails}>
            <div className="flex items-center gap-1">
              <TokenUsageBadge
                inputUsage={Number(value.inputUsage)}
                outputUsage={Number(value.outputUsage)}
                totalUsage={Number(value.totalUsage)}
                inline
              />
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 130,
      loadingCell: <TableTextLoadingCell />,
      cell: ({ row }) => {
        const cost = row.original.totalCost;
        return cost != null ? (
          <BreakdownTooltip details={row.original.costDetails} isCost>
            <div className="flex items-center gap-1">
              {cost ? (
                <span>{usdFormatter(cost.toNumber())}</span>
              ) : (
                <span>-</span>
              )}
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : null;
      },
      enableSorting: true,
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      loadingCell: <TableBadgeLoadingCell />,
      cell: ({ row }) => {
        const value = row.original.environment;
        return value ? (
          <Badge
            variant="secondary"
            className="max-w-fit truncate rounded-sm px-1 font-normal"
          >
            {value}
          </Badge>
        ) : null;
      },
    },
    {
      accessorKey: "tags",
      id: "tags",
      header: "Tags",
      size: 150,
      headerTooltip: {
        description: "Group traces with tags.",
        href: "https://langfuse.com/docs/observability/features/tags",
      },
      loadingCell: <TableTextLoadingCell />,
      // Real Traces Tags cell: TagList inside the `flex gap-x-2 gap-y-1`
      // wrapper, wrapping only on non-"s" row heights.
      cell: ({ row }) => {
        const traceTags = row.original.tags;
        return (
          traceTags &&
          traceTags.length > 0 && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} />
            </div>
          )
        );
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 400,
      loadingCell: () => (
        <MemoizedIOTableCell
          isLoading
          data={undefined}
          singleLine={singleLine}
        />
      ),
      cell: ({ row }) => (
        <MemoizedIOTableCell
          data={row.original.metadata}
          singleLine={singleLine}
          enableExpandOnHover={singleLine}
        />
      ),
    },
    {
      accessorKey: "userId",
      header: "User",
      id: "userId",
      size: 150,
      // Default-hidden in the real table; seeds the Columns drawer unchecked.
      defaultHidden: true,
      cell: ({ row }) => {
        const value = row.original.userId;
        return value ? <TableIdOrName value={value} /> : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "id",
      header: "Trace ID",
      id: "id",
      size: 90,
      defaultHidden: true,
      cell: ({ row }) => <TableIdOrName value={row.original.id} />,
      enableSorting: true,
    },
    {
      accessorKey: "action",
      header: "Action",
      id: "action",
      size: 70,
      isFixedPosition: true,
      // Real action menu: ghost MoreVertical trigger + dropdown. The destructive
      // item is a plain menu item (the real one renders DeleteTraceButton, which
      // needs tRPC) but the trigger DOM/spacing is identical.
      cell: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem className="text-destructive">
              <Trash className="mr-2 h-4 w-4" />
              Delete trace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

function BookmarkCell({ defaultValue }: { defaultValue: boolean }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <StarToggle
      value={value}
      size="icon-xs"
      isLoading={false}
      onClick={async (next) => {
        setValue(next);
      }}
    />
  );
}

// -----------------------------------------------------------------------------
// Plain columns (simple data-state / pagination stories)
// -----------------------------------------------------------------------------
// A lightweight subset reusing the same faithful cells, for the data-state,
// pagination, and selection stories where the full Traces column set is noise.

const plainColumns: LangfuseColumnDef<TraceRow>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "ID",
    isPinnedLeft: true,
    size: 220,
    cell: ({ row }) => <TableIdOrName value={row.original.id} />,
  },
  {
    accessorKey: "name",
    id: "name",
    header: "Name",
    enableSorting: true,
    size: 180,
    cell: ({ row }) => row.original.name,
  },
  {
    accessorKey: "timestamp",
    id: "timestamp",
    header: "Timestamp",
    enableSorting: true,
    size: 200,
    cell: ({ row }) => <LocalIsoDate date={row.original.timestamp} />,
  },
  {
    accessorKey: "environment",
    id: "environment",
    header: "Environment",
    size: 130,
    cell: ({ row }) => (
      <Badge
        variant="secondary"
        className="max-w-fit truncate rounded-sm px-1 font-normal"
      >
        {row.original.environment}
      </Badge>
    ),
  },
  {
    accessorKey: "latency",
    id: "latency",
    header: "Latency",
    enableSorting: true,
    size: 120,
    cell: ({ row }) => (
      <span className="text-nowrap">
        {formatIntervalSeconds(row.original.latency)}
      </span>
    ),
  },
];

// -----------------------------------------------------------------------------
// Stateful async wrapper (emulates server pagination without a backend)
// -----------------------------------------------------------------------------

type PaginationMode = "offset" | "cursor" | "none";

function useAsyncPagedData<TRow>({
  rows,
  pageSize,
  mode,
  latencyMs = 450,
}: {
  rows: TRow[];
  pageSize: number;
  mode: PaginationMode;
  latencyMs?: number;
}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [isLoading, setIsLoading] = useState(false);

  const slice = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return rows.slice(start, start + pagination.pageSize);
  }, [rows, pagination.pageIndex, pagination.pageSize]);

  const onChange = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      setIsLoading(true);
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        window.setTimeout(() => setIsLoading(false), latencyMs);
        return next;
      });
    },
    [latencyMs],
  );

  const data: AsyncTableData<TRow[]> = {
    isLoading,
    isError: false,
    data: isLoading ? undefined : slice,
  };

  const totalCount = rows.length;
  const lastPageIndex = Math.ceil(totalCount / pagination.pageSize) - 1;
  const hasNextPage = pagination.pageIndex < lastPageIndex;

  const paginationProp =
    mode === "none"
      ? undefined
      : mode === "offset"
        ? {
            totalCount,
            onChange,
            state: pagination,
            options: [10, 20, 50],
          }
        : {
            totalCount: null,
            hasNextPage,
            canJumpPages: false,
            onChange,
            state: pagination,
            options: [10, 20, 50],
          };

  return { data, paginationProp, pagination };
}

// -----------------------------------------------------------------------------
// Shared knob args
// -----------------------------------------------------------------------------

type DataTableStoryArgs = {
  rowHeight?: RowHeight;
  cellPadding?: "compact" | "comfortable" | "none";
  topAlignCells?: boolean;
  shouldRenderGroupHeaders?: boolean;
};

// -----------------------------------------------------------------------------
// Meta
// -----------------------------------------------------------------------------
// DataTable is generic; pin the generic via a thin wrapper so args infer at
// TraceRow (the default `TData = object` generic makes typed columns/data
// unassignable through preview.meta).
type DataTableDemoProps = Parameters<typeof DataTable<TraceRow, unknown>>[0];

function DataTableDemo(props: DataTableDemoProps) {
  return <DataTable<TraceRow, unknown> {...props} />;
}

const meta = preview.meta({
  title: "Components/Table/DataTable",
  component: DataTableDemo,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    tableName: "story-data-table",
    columns: plainColumns,
    data: { isLoading: false, isError: false, data: TRACE_ROWS.slice(0, 20) },
  },
  decorators: [
    (Story) => (
      <div className="bg-background flex h-screen flex-col p-4">
        <Story />
      </div>
    ),
  ],
});

export default meta;

// -----------------------------------------------------------------------------
// 1. Data states
// -----------------------------------------------------------------------------

export const Loading = meta.story({
  render: () => (
    <DataTable
      tableName="story-loading"
      columns={plainColumns}
      data={{ isLoading: true, isError: false }}
      pagination={{
        totalCount: null,
        onChange: fn(),
        state: { pageIndex: 0, pageSize: 10 },
      }}
    />
  ),
});

export const Loaded = meta.story({
  render: () => (
    <DataTable
      tableName="story-loaded"
      columns={plainColumns}
      data={{ isLoading: false, isError: false, data: TRACE_ROWS.slice(0, 20) }}
      pagination={{
        totalCount: TRACE_ROWS.length,
        onChange: fn(),
        state: { pageIndex: 0, pageSize: 20 },
      }}
    />
  ),
});

export const Empty = meta.story({
  render: () => (
    <DataTable
      tableName="story-empty"
      columns={plainColumns}
      data={{ isLoading: false, isError: false, data: [] }}
      noResultsMessage="No traces match the current filters."
      pagination={{
        totalCount: 0,
        onChange: fn(),
        state: { pageIndex: 0, pageSize: 20 },
      }}
    />
  ),
});

// KNOWN GAP (research inventory G1): data.isError is never rendered by DataTable.
// On a query error, data.data is undefined, so the body falls into the
// `!data.data` branch and renders skeleton rows FOREVER — the error message is
// discarded and the user sees an infinite loading state. This story exposes that
// bug; the fix is to add a real error UI branch to TableBodyComponent.
export const Error = meta.story({
  render: () => (
    <DataTable
      tableName="story-error"
      columns={plainColumns}
      data={{
        isLoading: false,
        isError: true,
        error: "Failed to load traces: upstream query timed out (504).",
      }}
      pagination={{
        totalCount: null,
        onChange: fn(),
        state: { pageIndex: 0, pageSize: 10 },
      }}
    />
  ),
});

// -----------------------------------------------------------------------------
// 2. TracesLike — faithful reproduction of the real Traces table
// -----------------------------------------------------------------------------
// Same columns, same cell components, same density (compact default), same
// `singleLine = rowHeight === "s"` IO rule as components/table/use-cases/traces.tsx.
// Put this side-by-side with the real Traces table at :3001 to confirm cell-level
// fidelity (esp. IO cell padding, Tags chip spacing, badge typography, the
// timestamp/latency text, and the trailing action menu).

function TracesLikeStory(args: DataTableStoryArgs) {
  const { data, paginationProp } = useAsyncPagedData<TraceRow>({
    rows: TRACE_ROWS,
    pageSize: 10,
    mode: "offset",
  });
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "timestamp",
    order: "DESC",
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const rowHeight = args.rowHeight ?? "s";
  const columns = useMemo(() => buildTraceColumns(rowHeight), [rowHeight]);

  const [columnVisibility, setColumnVisibility] = useState(() => {
    const initial: Record<string, boolean> = {};
    for (const col of columns) {
      if (col.defaultHidden && col.id) initial[col.id] = false;
    }
    return initial;
  });

  return (
    <DataTable<TraceRow, unknown>
      tableName="traces"
      columns={columns}
      data={data}
      pagination={paginationProp}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      rowHeight={rowHeight}
      cellPadding={args.cellPadding}
      topAlignCells={args.topAlignCells}
    />
  );
}

export const TracesLike = meta.story({
  args: {
    rowHeight: "s",
    cellPadding: "compact",
    topAlignCells: false,
  },
  argTypes: {
    rowHeight: {
      control: "inline-radio",
      options: ["s", "m", "l"],
      description:
        "Row height: s=h-7, m=h-24, l=h-64. Traces defaults to 's'. On 's' the IO cells render single-line; on m/l they expand (matches the real table's `singleLine = rowHeight === 's'` rule).",
    },
    cellPadding: {
      control: "inline-radio",
      options: ["compact", "comfortable", "none"],
      description: "Traces uses the compact default.",
    },
    topAlignCells: {
      control: "boolean",
      description:
        "Top-align cell content (used by experiment compare/grid only).",
    },
  },
  render: (args) => (
    <TracesLikeStory
      rowHeight={args.rowHeight}
      cellPadding={args.cellPadding}
      topAlignCells={args.topAlignCells}
    />
  ),
});

// -----------------------------------------------------------------------------
// 3. KitchenSink — knob-driven Traces-shaped table (all four knobs live)
// -----------------------------------------------------------------------------
// Same faithful Traces columns as TracesLike, but with all four DataTable knobs
// exposed (rowHeight / cellPadding / topAlignCells / shouldRenderGroupHeaders)
// plus a grouped "Scores"/"Cost & usage" two-row header so the otherwise-dead
// shouldRenderGroupHeaders path (no production caller passes it) can be toggled.

function buildKitchenSinkColumns(
  rowHeight: RowHeight,
): LangfuseColumnDef<TraceRow>[] {
  const base = buildTraceColumns(rowHeight);
  // Insert two grouped headers before the trailing action column to exercise
  // the two-row header path. The children reuse the same usage/cost accessors.
  const groupedScores: LangfuseColumnDef<TraceRow> = {
    accessorKey: "scoresGroup",
    id: "scoresGroup",
    header: "Scores",
    columns: [
      {
        accessorKey: "observationCount",
        id: "observationCount",
        header: "Observations",
        size: 110,
        cell: ({ row }) => (
          <span>{numberFormatter(row.original.observationCount, 0)}</span>
        ),
      },
      {
        accessorKey: "latency",
        id: "latencyScore",
        header: "Latency (s)",
        size: 110,
        cell: ({ row }) => row.original.latency.toFixed(2),
      },
    ] satisfies LangfuseColumnDef<TraceRow>[],
  };
  const groupedUsage: LangfuseColumnDef<TraceRow> = {
    accessorKey: "usageGroup",
    id: "usageGroup",
    header: "Cost & usage",
    columns: [
      {
        accessorKey: "totalCost",
        id: "totalCostGrouped",
        header: "Cost (USD)",
        size: 110,
        cell: ({ row }) => usdFormatter(row.original.totalCost.toNumber()),
      },
      {
        accessorKey: "usage",
        id: "totalTokensGrouped",
        header: "Tokens",
        size: 100,
        cell: ({ row }) => numberFormatter(row.original.usage.totalUsage, 0),
      },
    ] satisfies LangfuseColumnDef<TraceRow>[],
  };
  // place groups just before the action column (last entry)
  return [...base.slice(0, -1), groupedScores, groupedUsage, base.at(-1)!];
}

function KitchenSinkStory(args: DataTableStoryArgs) {
  const { data, paginationProp } = useAsyncPagedData<TraceRow>({
    rows: TRACE_ROWS,
    pageSize: 10,
    mode: "offset",
  });
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "timestamp",
    order: "DESC",
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const rowHeight = args.rowHeight ?? "m";
  const columns = useMemo(
    () => buildKitchenSinkColumns(rowHeight),
    [rowHeight],
  );

  const [columnVisibility, setColumnVisibility] = useState(() => {
    const initial: Record<string, boolean> = {};
    for (const col of columns) {
      if (col.defaultHidden && col.id) initial[col.id] = false;
    }
    return initial;
  });

  return (
    <DataTable<TraceRow, unknown>
      tableName="story-kitchen-sink"
      columns={columns}
      data={data}
      pagination={paginationProp}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      rowHeight={rowHeight}
      cellPadding={args.cellPadding}
      topAlignCells={args.topAlignCells}
      shouldRenderGroupHeaders={args.shouldRenderGroupHeaders}
    />
  );
}

export const KitchenSink = meta.story({
  args: {
    rowHeight: "m",
    cellPadding: "compact",
    topAlignCells: false,
    shouldRenderGroupHeaders: true,
  },
  argTypes: {
    rowHeight: {
      control: "inline-radio",
      options: ["s", "m", "l"],
      description: "Row height: s=h-7, m=h-24, l=h-64",
    },
    cellPadding: {
      control: "inline-radio",
      options: ["compact", "comfortable", "none"],
    },
    topAlignCells: {
      control: "boolean",
      description:
        "Top-align cell content (used by experiment compare/grid only)",
    },
    shouldRenderGroupHeaders: {
      control: "boolean",
      description:
        "Render the two-row grouped header (Scores / Cost & usage). Dead path in production — no caller passes it.",
    },
  },
  render: (args) => (
    <KitchenSinkStory
      rowHeight={args.rowHeight}
      cellPadding={args.cellPadding}
      topAlignCells={args.topAlignCells}
      shouldRenderGroupHeaders={args.shouldRenderGroupHeaders}
    />
  ),
});

// -----------------------------------------------------------------------------
// 4. Pagination variants
// -----------------------------------------------------------------------------

function PaginationStory({ mode }: { mode: PaginationMode }) {
  const { data, paginationProp } = useAsyncPagedData<TraceRow>({
    rows: TRACE_ROWS,
    pageSize: 10,
    mode,
  });
  return (
    <DataTable
      tableName={`story-pagination-${mode}`}
      columns={plainColumns}
      data={data}
      pagination={paginationProp}
    />
  );
}

export const OffsetPagination = meta.story({
  render: () => <PaginationStory mode="offset" />,
});

export const CursorPagination = meta.story({
  render: () => <PaginationStory mode="cursor" />,
});

export const NoPagination = meta.story({
  render: () => <PaginationStory mode="none" />,
});

// -----------------------------------------------------------------------------
// 5. Row selection (authored checkbox column)
// -----------------------------------------------------------------------------
// The selection checkbox column is NOT part of DataTable — each table authors
// its own. The ID column is pinned-left; pinned cells force an opaque
// background, so the selected-row tint (bg-muted/40) stops at the pin seam.

function buildSelectionColumns(): LangfuseColumnDef<TraceRow>[] {
  return [
    {
      accessorKey: "select",
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows on this page"
        />
      ),
      size: 40,
      enableSorting: false,
      isFixedPosition: true,
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    ...plainColumns,
  ];
}

const selectionColumns = buildSelectionColumns();

function RowSelectionStory() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const data: AsyncTableData<TraceRow[]> = {
    isLoading: false,
    isError: false,
    data: TRACE_ROWS.slice(0, 20),
  };
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      <div className="text-muted-foreground mb-2 text-sm">
        {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
      </div>
      <DataTable
        tableName="story-row-selection"
        columns={selectionColumns}
        data={data}
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        pagination={{
          totalCount: 20,
          onChange: fn(),
          state: { pageIndex: 0, pageSize: 20 },
        }}
      />
    </div>
  );
}

export const RowSelection = meta.story({
  render: () => <RowSelectionStory />,
});

// -----------------------------------------------------------------------------
// 6. Density showcase
// -----------------------------------------------------------------------------
// Same faithful Traces columns at three row heights, so alignment/density
// differences are visible. The IO cells switch from single-line ("s") to
// expanded (m/l) exactly as in production.

const densityData: AsyncTableData<TraceRow[]> = {
  isLoading: false,
  isError: false,
  data: TRACE_ROWS.slice(0, 6),
};

function DensityPanel({ rowHeight }: { rowHeight: RowHeight }) {
  const label = { s: "Small (h-7)", m: "Medium (h-24)", l: "Large (h-64)" }[
    rowHeight
  ];
  const columns = useMemo(() => buildTraceColumns(rowHeight), [rowHeight]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-muted-foreground mb-1 text-xs font-medium">
        rowHeight = {rowHeight} — {label}
      </div>
      <div className="flex min-h-0 flex-1 flex-col border">
        <DataTable<TraceRow, unknown>
          tableName={`story-density-${rowHeight}`}
          columns={columns}
          data={densityData}
          rowHeight={rowHeight}
        />
      </div>
    </div>
  );
}

export const DensityShowcase = meta.story({
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="bg-background flex h-screen flex-col gap-4 p-4">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      <DensityPanel rowHeight="s" />
      <DensityPanel rowHeight="m" />
      <DensityPanel rowHeight="l" />
    </>
  ),
});

// -----------------------------------------------------------------------------
// 7. PromptsLike — faithful reproduction of the real Prompts table
// -----------------------------------------------------------------------------
// Reproduces features/prompts/components/prompts-table.tsx cell-for-cell:
//   - cellPadding="comfortable" (the Prompts one-off override at prompts-table.tsx:482)
//   - Name column: folder rows use the real FolderBreadcrumbLink (TableLink +
//     Folder icon, capped at max-h-4); prompt rows use TableLink to the prompt.
//   - Versions/Type: folder rows render null -> empty cells (column rhythm
//     visibly breaks between folder and prompt rows, as in production).
//   - "Latest Version Created At": LocalIsoDate, null on folder rows.
//   - "Number of Observations (7d)": TableLink wrapping the count (0 still links),
//     with the real Skeleton fallback shape (h-3 w-1/2).
//   - Tags: real TagList in the `flex gap-x-1 gap-y-1` wrapper that
//     TagManager/TagPromptPopover renders; folder rows render the `h-6` spacer.
//   - Actions: ghost icon button(s) — folder rows duplicate+delete, prompt rows
//     delete — matching the real Actions column slot.

type PromptRow = {
  id: string;
  name: string;
  fullPath: string;
  type: "folder" | "text" | "chat";
  version?: number;
  createdAt?: Date;
  numberOfObservations?: number;
  tags?: string[];
};

const PROMPT_ROWS: PromptRow[] = [
  {
    id: "folder-checkout",
    name: "checkout",
    fullPath: "checkout",
    type: "folder",
  },
  {
    id: "folder-retrieval",
    name: "retrieval",
    fullPath: "retrieval",
    type: "folder",
  },
  {
    id: "chat-summarizer",
    name: "summarizer",
    fullPath: "summarizer",
    type: "chat",
    version: 12,
    createdAt: new Date("2026-06-21T14:30:00.000Z"),
    numberOfObservations: 18432,
    tags: ["production", "rag", "reviewed"],
  },
  {
    id: "text-intent-classifier",
    name: "intent-classifier",
    fullPath: "intent-classifier",
    type: "text",
    version: 3,
    createdAt: new Date("2026-06-20T09:12:00.000Z"),
    numberOfObservations: 0,
    tags: ["staging"],
  },
  {
    id: "text-guardrail-eval",
    name: "guardrail-eval",
    fullPath: "guardrail-eval",
    type: "text",
    version: 7,
    createdAt: new Date("2026-06-19T22:05:00.000Z"),
    numberOfObservations: 944,
    tags: [],
  },
  {
    id: "chat-rerank-step",
    name: "rerank-step",
    fullPath: "rerank-step",
    type: "chat",
    version: 1,
    createdAt: new Date("2026-06-18T11:48:00.000Z"),
    numberOfObservations: 27,
    tags: ["experimental", "latency-sensitive"],
  },
];

const promptColumns: LangfuseColumnDef<PromptRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    id: "name",
    enableSorting: true,
    size: 250,
    cell: ({ row }) => {
      const { name, type, fullPath } = row.original;
      if (type === "folder") {
        // Real folder cell: FolderBreadcrumbLink (TableLink + Folder icon).
        return <FolderBreadcrumbLink name={name} onClick={() => {}} />;
      }
      return name ? (
        <TableLink
          path={`/prompts/${encodeURIComponent(fullPath)}`}
          value={name}
          title={fullPath}
        />
      ) : undefined;
    },
  },
  {
    accessorKey: "version",
    header: "Versions",
    id: "version",
    enableSorting: true,
    size: 70,
    cell: ({ row }) =>
      row.original.type === "folder" ? null : row.original.version,
  },
  {
    accessorKey: "type",
    header: "Type",
    id: "type",
    enableSorting: true,
    size: 60,
  },
  {
    accessorKey: "createdAt",
    header: "Latest Version Created At",
    id: "createdAt",
    enableSorting: true,
    size: 200,
    cell: ({ row }) => {
      if (row.original.type === "folder") return null;
      const createdAt = row.original.createdAt;
      return createdAt ? <LocalIsoDate date={createdAt} /> : null;
    },
  },
  {
    accessorKey: "numberOfObservations",
    header: "Number of Observations (7d)",
    id: "numberOfObservations",
    size: 170,
    cell: ({ row }) => {
      if (row.original.type === "folder") return null;
      const n = row.original.numberOfObservations;
      // Real cell shows a Skeleton h-3 w-1/2 while metrics load; here metrics
      // are "loaded", so it always renders the TableLink (0 still links).
      if (n === undefined) {
        return <Skeleton className="h-3 w-1/2" />;
      }
      return <TableLink path="/observations" value={n.toLocaleString()} />;
    },
  },
  {
    accessorKey: "tags",
    header: "Tags",
    id: "tags",
    enableSorting: true,
    size: 120,
    cell: ({ row }) => {
      // height h-6 to keep folder & prompt rows the same height (real table).
      if (row.original.type === "folder") return <div className="h-6" />;
      const tags = row.original.tags ?? [];
      // Real Tags cell renders TagManager (no-access path) -> TagList inside a
      // `flex gap-x-1 gap-y-1` wrapper; reuse the same wrapper + TagList.
      return (
        <div className="flex gap-x-1 gap-y-1">
          <TagList selectedTags={tags} isLoading={false} viewOnly />
        </div>
      );
    },
    enableHiding: true,
  },
  {
    accessorKey: "id",
    id: "actions",
    header: "Actions",
    size: 70,
    enableSorting: false,
    cell: ({ row }) => {
      if (row.original.type === "folder") {
        return (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Duplicate folder"
            >
              <Trash className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Delete folder">
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        );
      }
      return (
        <Button variant="ghost" size="icon-xs" aria-label="Delete prompt">
          <Trash className="h-4 w-4" />
        </Button>
      );
    },
  },
];

function PromptsLikeStory(args: DataTableStoryArgs) {
  const { data, paginationProp } = useAsyncPagedData<PromptRow>({
    rows: PROMPT_ROWS,
    pageSize: 20,
    mode: "offset",
  });
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "createdAt",
    order: "DESC",
  });

  return (
    <DataTable<PromptRow, unknown>
      tableName="prompts"
      columns={promptColumns}
      data={data}
      pagination={paginationProp}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      rowHeight={args.rowHeight}
      // The real Prompts table sets comfortable density (prompts-table.tsx:482).
      cellPadding={args.cellPadding}
    />
  );
}

export const PromptsLike = meta.story({
  args: {
    rowHeight: "s",
    cellPadding: "comfortable",
  },
  argTypes: {
    rowHeight: {
      control: "inline-radio",
      options: ["s", "m", "l"],
      description: "Row height: s=h-7, m=h-24, l=h-64 (Prompts uses s)",
    },
    cellPadding: {
      control: "inline-radio",
      options: ["compact", "comfortable", "none"],
      description:
        "Cell padding. The real Prompts table sets 'comfortable' (prompts-table.tsx:482); flip to 'compact' to compare against the dense default.",
    },
  },
  render: (args) => (
    <PromptsLikeStory
      rowHeight={args.rowHeight}
      cellPadding={args.cellPadding}
    />
  ),
});
