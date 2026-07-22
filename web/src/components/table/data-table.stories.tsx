import preview from "../../../.storybook/preview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Copy,
  InfoIcon,
  ListTree,
  MoreVertical,
  PlusCircle,
  Trash,
} from "lucide-react";

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
//
// The IOTableCell relies on MarkdownContext; that is provided globally in
// .storybook/preview.tsx (mirroring how the app wraps every page), not per
// story, so no story needs a setup play function to make cells render.

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

// Enough rows to exercise multi-page pagination; cheap to build, all in-memory.
const TRACE_ROWS: TraceRow[] = Array.from({ length: 60 }, (_, i) =>
  makeTraceRow(i),
);

// Small loaded slice reused by the data-state and selection stories.
function loadedTraceData(count = 20): AsyncTableData<TraceRow[]> {
  return {
    isLoading: false,
    isError: false,
    data: TRACE_ROWS.slice(0, count),
  };
}

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

// Same plain columns, but the ID column is pinned-left. Pinned cells force an
// opaque background, so the selected-row tint stops at the pin seam.
const pinnedColumns: LangfuseColumnDef<TraceRow>[] = plainColumns.map((col) =>
  col.id === "id" ? { ...col, isPinnedLeft: true } : col,
);

// -----------------------------------------------------------------------------
// Stateful async wrapper (emulates server pagination without a backend)
// -----------------------------------------------------------------------------
// This is the one place a custom render function is genuinely warranted: the
// pagination stories need live page state + a simulated request latency, which
// args cannot express. Kept minimal and typed.

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

  // The state updater must stay pure (React may call it twice, e.g. in
  // StrictMode), so it only computes the next state. The emulated "server"
  // latency — flip to loading, then deliver the next page — is scheduled in an
  // effect keyed on `pagination` instead. The ref-guarded timer is cleared on
  // re-run/unmount so a rapid page change never leaks a duplicate timeout.
  const onChange = useCallback<OnChangeFn<PaginationState>>((updater) => {
    setPagination((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  }, []);

  const didMount = useRef(false);
  useEffect(() => {
    // Skip the initial render: only a real page change emulates a request.
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setIsLoading(true);
    const timer = window.setTimeout(() => setIsLoading(false), latencyMs);
    return () => window.clearTimeout(timer);
  }, [pagination, latencyMs]);

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
// Meta
// -----------------------------------------------------------------------------
// DataTable is generic; pin the generic via a thin wrapper so args infer at
// TraceRow (the default `TData = object` generic makes typed columns/data
// unassignable through preview.meta). Typed `preview.meta` / `meta.story`
// metadata is what type-checks every story's args, decorators, and play.
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
    data: loadedTraceData(),
    pagination: {
      totalCount: TRACE_ROWS.length,
      onChange: fn(),
      state: { pageIndex: 0, pageSize: 20 },
    },
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
// Driven purely by args off the meta defaults — no custom render needed.

export const Default = meta.story({});

export const Loading = meta.story({
  args: {
    data: { isLoading: true, isError: false },
    pagination: {
      totalCount: null,
      onChange: fn(),
      state: { pageIndex: 0, pageSize: 10 },
    },
  },
});

export const Empty = meta.story({
  args: {
    data: { isLoading: false, isError: false, data: [] },
    noResultsMessage: "No traces match the current filters.",
    pagination: {
      totalCount: 0,
      onChange: fn(),
      state: { pageIndex: 0, pageSize: 20 },
    },
  },
});

// KNOWN GAP (research inventory G1): data.isError is never rendered by DataTable.
// On a query error, data.data is undefined, so the body falls into the
// `!data.data` branch and renders skeleton rows FOREVER — the error message is
// discarded and the user sees an infinite loading state. This story exposes that
// bug; the fix is to add a real error UI branch to TableBodyComponent.
export const Error = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: true,
      error: "Failed to load traces: upstream query timed out (504).",
    },
    pagination: {
      totalCount: null,
      onChange: fn(),
      state: { pageIndex: 0, pageSize: 10 },
    },
  },
});

// -----------------------------------------------------------------------------
// 2. Pinned column
// -----------------------------------------------------------------------------
// The ID column is pinned-left; the sticky cell keeps an opaque background while
// the rest of the row scrolls horizontally underneath it.

export const WithPinnedColumn = meta.story({
  args: {
    tableName: "story-pinned-column",
    columns: pinnedColumns,
  },
});

// -----------------------------------------------------------------------------
// 3. Row selection (authored checkbox column + stateful selection)
// -----------------------------------------------------------------------------
// The selection checkbox column is NOT part of DataTable — each table authors
// its own. This needs live selection state, so it uses a small typed wrapper.

const selectionColumns: LangfuseColumnDef<TraceRow>[] = [
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

function RowSelectionStory() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      <div className="text-muted-foreground mb-2 text-sm">
        {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
      </div>
      <DataTable<TraceRow, unknown>
        tableName="story-row-selection"
        columns={selectionColumns}
        data={loadedTraceData()}
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

export const WithRowSelection = meta.story({
  render: () => <RowSelectionStory />,
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
// 5. Density variants (faithful Traces columns)
// -----------------------------------------------------------------------------
// Discrete state stories per density. These use fixed variant props (rowHeight /
// cellPadding) and expose NO args to customize them — they show one defined
// state each, matching the production tables:
//   - Dense:       rowHeight "s" + compact, the real Traces default.
//   - Comfortable: rowHeight "m" + comfortable, expanded IO cells.

// One full page of rows. `manualPagination` is on (server-driven), so TanStack
// does not slice; the footer reflects these props verbatim. Keep data length,
// pageSize, and totalCount equal so the footer reads a truthful "1 - 10 of 10".
const TRACES_PAGE_SIZE = 10;
const tracesPagination = {
  totalCount: TRACES_PAGE_SIZE,
  onChange: fn(),
  state: { pageIndex: 0, pageSize: TRACES_PAGE_SIZE },
};

function TracesTable({
  tableName,
  rowHeight,
  cellPadding,
}: {
  tableName: string;
  rowHeight: RowHeight;
  cellPadding?: "compact" | "comfortable" | "none";
}) {
  const columns = useMemo(() => buildTraceColumns(rowHeight), [rowHeight]);
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "timestamp",
    order: "DESC",
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const initial: Record<string, boolean> = {};
    for (const col of columns) {
      if (col.defaultHidden && col.id) initial[col.id] = false;
    }
    return initial;
  });

  return (
    <DataTable<TraceRow, unknown>
      tableName={tableName}
      columns={columns}
      data={loadedTraceData(TRACES_PAGE_SIZE)}
      pagination={tracesPagination}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      rowHeight={rowHeight}
      cellPadding={cellPadding}
    />
  );
}

export const Dense = meta.story({
  render: () => (
    <TracesTable tableName="story-dense" rowHeight="s" cellPadding="compact" />
  ),
});

export const Comfortable = meta.story({
  render: () => (
    <TracesTable
      tableName="story-comfortable"
      rowHeight="m"
      cellPadding="comfortable"
    />
  ),
});

// -----------------------------------------------------------------------------
// 6. Density matrix (design showcase)
// -----------------------------------------------------------------------------
// Renders the same faithful Traces columns at all three row heights side by side
// so density/alignment differences are visible at a glance. Per the storybook
// skill, a variant-showcase story renders the component multiple times with
// predefined props and exposes no args + no play function.

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
      <div className="text-muted-foreground mb-1 text-xs font-bold">
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

export const DensityMatrix = meta.story({
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
// 7. Grouped headers (two-row header path)
// -----------------------------------------------------------------------------
// Exercises the otherwise-dead `shouldRenderGroupHeaders` path (no production
// caller passes it) with a grouped "Scores" / "Cost & usage" two-row header on
// top of the faithful Traces columns. Fixed predefined props, no args.

function buildGroupedColumns(
  rowHeight: RowHeight,
): LangfuseColumnDef<TraceRow>[] {
  const base = buildTraceColumns(rowHeight);
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

function GroupedHeadersStory() {
  const rowHeight: RowHeight = "m";
  const columns = useMemo(() => buildGroupedColumns(rowHeight), [rowHeight]);
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "timestamp",
    order: "DESC",
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const initial: Record<string, boolean> = {};
    for (const col of columns) {
      if (col.defaultHidden && col.id) initial[col.id] = false;
    }
    return initial;
  });

  return (
    <DataTable<TraceRow, unknown>
      tableName="story-grouped-headers"
      columns={columns}
      data={loadedTraceData(10)}
      pagination={tracesPagination}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      rowHeight={rowHeight}
      cellPadding="compact"
      shouldRenderGroupHeaders
    />
  );
}

export const WithGroupedHeaders = meta.story({
  render: () => <GroupedHeadersStory />,
});

// -----------------------------------------------------------------------------
// 8. Folder rows (faithful Prompts table — design showcase)
// -----------------------------------------------------------------------------
// Reproduces features/prompts/components/prompts-table.tsx cell-for-cell:
//   - cellPadding="comfortable" (the Prompts one-off override at prompts-table.tsx:482)
//   - Name column: folder rows use the real FolderBreadcrumbLink (TableLink +
//     Folder icon); prompt rows use TableLink to the prompt.
//   - Versions/Type: folder rows render null -> empty cells (column rhythm
//     visibly breaks between folder and prompt rows, as in production).
//   - "Latest Version Created At": LocalIsoDate, null on folder rows.
//   - "Number of Observations (7d)": TableLink wrapping the count (0 still links),
//     with the real Skeleton fallback shape (h-3 w-1/2).
//   - Tags: real TagList in the `flex gap-x-1 gap-y-1` wrapper; folder rows
//     render the `h-6` spacer.
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
              <Copy className="h-4 w-4" />
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

function FolderRowsStory() {
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
      tableName="story-folder-rows"
      columns={promptColumns}
      data={data}
      pagination={paginationProp}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      rowHeight="s"
      // The real Prompts table sets comfortable density (prompts-table.tsx:482).
      cellPadding="comfortable"
    />
  );
}

export const WithFolderRows = meta.story({
  render: () => <FolderRowsStory />,
});

// -----------------------------------------------------------------------------
// 9. Inline icon cells (alignment regression harness)
// -----------------------------------------------------------------------------
// Trailing/leading icons next to cell text are a supported pattern (the
// "Provided Model Name" create-affordance, ListTree source links, folder rows).
// They must NOT shift the text baseline relative to plain rows. This story puts
// every variant in one column so any vertical-alignment regression is obvious:
//   - plain TableIdOrName (no icon)
//   - TableIdOrName + trailing PlusCircle — mirrors features/models
//     ProvidedModelNameCell: the name is wrapped in `inline-flex items-center`
//     with the icon as a `shrink-0` adornment, so it lands on the same baseline
//     as the no-icon rows.
//   - TableLink with a leading icon (ListTree)
//   - FolderBreadcrumbLink (Folder icon)
// A second plain-text column shows the row stays aligned across the table.

type IconCellRow = {
  id: string;
  name: string;
  kind: "plain" | "createModel" | "link" | "folder";
  detail: string;
};

const ICON_CELL_ROWS: IconCellRow[] = [
  { id: "1", name: "gpt-4o-mini", kind: "plain", detail: "resolved" },
  { id: "2", name: "gpt-3.5-turbo", kind: "createModel", detail: "unmatched" },
  {
    id: "3",
    name: "claude-3-5-sonnet",
    kind: "createModel",
    detail: "unmatched",
  },
  {
    id: "4",
    name: "text-embedding-3-large",
    kind: "plain",
    detail: "resolved",
  },
  { id: "5", name: "obs-7c1f-typography", kind: "link", detail: "source" },
  { id: "6", name: "shared-prompts", kind: "folder", detail: "folder" },
  {
    id: "7",
    name: "gpt-4.1-judge-pipeline",
    kind: "createModel",
    detail: "unmatched",
  },
];

const iconCellColumns: LangfuseColumnDef<IconCellRow>[] = [
  {
    accessorKey: "name",
    id: "name",
    header: "Provided Model Name",
    size: 260,
    cell: ({ row }) => {
      const { name, kind } = row.original;
      switch (kind) {
        case "createModel":
          // Faithful to ProvidedModelNameCell: same TableIdOrName + trailing
          // icon, in a native <button> trigger (keyboard-activatable).
          return (
            <button
              type="button"
              className="inline-flex max-w-full cursor-pointer items-center gap-1 text-left"
            >
              <TableIdOrName value={name} className="min-w-0" />
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
            </button>
          );
        case "link":
          return (
            <TableLink
              path="#"
              value={name}
              icon={
                <span className="flex flex-row items-center gap-1">
                  <ListTree className="h-3.5 w-3.5 shrink-0" />
                  {name}
                </span>
              }
            />
          );
        case "folder":
          return <FolderBreadcrumbLink name={name} onClick={() => {}} />;
        case "plain":
        default:
          return (
            <span className="inline-flex max-w-full items-center">
              <TableIdOrName value={name} className="min-w-0" />
            </span>
          );
      }
    },
  },
  {
    accessorKey: "detail",
    id: "detail",
    header: "Status",
    size: 120,
    cell: ({ getValue }) => getValue<string>(),
  },
];

function InlineIconCellsStory() {
  const data: AsyncTableData<IconCellRow[]> = {
    isLoading: false,
    isError: false,
    data: ICON_CELL_ROWS,
  };
  return (
    <DataTable<IconCellRow, unknown>
      tableName="story-inline-icon-cells"
      columns={iconCellColumns}
      data={data}
      rowHeight="s"
    />
  );
}

export const WithInlineIconCells = meta.story({
  render: () => <InlineIconCellsStory />,
});
