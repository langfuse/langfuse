import preview from "../../../.storybook/preview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { expect, fn } from "storybook/test";
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
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { createTagsTableColumn } from "@/src/components/design-system/table/columns/createTagsTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createFolderKeyTableColumn } from "@/src/components/design-system/table/columns/createFolderKeyTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createDropdownTableColumn } from "@/src/components/design-system/table/columns/createDropdownTableColumn";
import { createTokenUsageTableColumn } from "@/src/components/design-system/table/columns/createTokenUsageTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { IdTableCell } from "@/src/components/design-system/table/components/IdTableCell/IdTableCell";
import {
  buildLocalIsoDatePresentation,
  formatIntervalSeconds,
} from "@/src/utils/dates";
import { IOTableCell } from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { MediaTag } from "@/src/components/MediaTag/MediaTag";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";
import {
  LevelCountsDisplay,
  type LevelCount,
} from "@/src/components/level-counts-display";
import { formatAsLabel, LevelSymbols } from "@/src/components/level-colors";
import TagList from "@/src/features/tag/components/TagList";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import {
  Copy,
  Folder,
  InfoIcon,
  ListTree,
  PlusCircle,
  Trash,
} from "lucide-react";

const renderMediaReference = (descriptor: MediaDescriptor) => (
  <MediaTag contentType={descriptor.contentType} status="idle" />
);

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
//   - tags:      real TagList in the real `flex gap-x-2 gap-y-1` wrapper,
//                instead of TagPromptPopover/TagManager (same visible children).
//   - actions:   createDropdownTableColumn (ghost MoreVertical trigger), with a
//                plain menu item instead of the tRPC-bound DeleteTraceButton.
// Everything else (TextLink, Badge, IOTableCell, LocalIsoDate, IdTableCell,
// createTokenUsageTableColumn, LevelCountsDisplay, folder links, Skeleton, the
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
// Mirrors the visible-by-default Traces columns. The action/selection
// cells use the standalone visual components (see FIDELITY GOAL note). The IO
// cells use the same IOTableCell variants + the
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
    createDateTableColumn<TraceRow>({
      accessorKey: "timestamp",
      header: "Timestamp",
      size: 150,
      enableSorting: true,
    }),
    createTextTableColumn<TraceRow>({
      accessorKey: "name",
      header: "Name",
      size: 150,
      enableSorting: true,
    }),
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 400,
      cellBackground: "gray",
      loadingCell: () => (
        <IOTableCell
          isLoading
          singleLine={singleLine}
          renderMediaReference={renderMediaReference}
        />
      ),
      cell: ({ row }) => (
        <IOTableCell
          data={row.original.input}
          singleLine={singleLine}
          enableExpandOnHover={singleLine}
          renderMediaReference={renderMediaReference}
        />
      ),
    },
    createIOTableColumn<TraceRow>({
      accessorKey: "output",
      header: "Output",
      size: 400,
      singleLine,
      enableExpandOnHover: singleLine,
      variant: "output",
    }),
    {
      accessorKey: "levelCounts",
      id: "levelCounts",
      header: "Observation Levels",
      size: 150,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
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
      loadingCell: <Skeleton className="h-4 w-1/2" />,
      cell: ({ row }) => {
        const value = row.original.latency;
        return value !== undefined ? (
          <span className="text-nowrap">{formatIntervalSeconds(value)}</span>
        ) : undefined;
      },
    },
    createTokenUsageTableColumn<TraceRow, TraceRow["usage"]>({
      id: "tokens",
      accessorFn: (row) => row.usage,
      header: "Tokens",
      size: 180,
      enableSorting: true,
      getCell: (value, { row }) => {
        if (!value?.inputUsage && !value?.outputUsage && !value?.totalUsage) {
          return undefined;
        }

        return {
          type: "usage",
          inputUsage: Number(value.inputUsage),
          outputUsage: Number(value.outputUsage),
          totalUsage: Number(value.totalUsage),
          details: row.original.tokenDetails,
        };
      },
    }),
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 130,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
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
      loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
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
    createTagsTableColumn<TraceRow>({
      accessorKey: "tags",
      header: "Tags",
      size: 150,
      headerTooltip: {
        description: "Group traces with tags.",
        href: "https://langfuse.com/docs/observability/features/tags",
      },
      shouldWrap: rowHeight !== "s",
    }),
    createIOTableColumn<TraceRow>({
      accessorKey: "metadata",
      header: "Metadata",
      size: 400,
      singleLine,
      enableExpandOnHover: singleLine,
    }),
    createIdTableColumn<TraceRow>({
      accessorKey: "userId",
      header: "User",
      size: 150,
      // Default-hidden in the real table; seeds the Columns drawer unchecked.
      defaultHidden: true,
      enableSorting: true,
    }),
    createIdTableColumn<TraceRow>({
      accessorKey: "id",
      header: "Trace ID",
      size: 90,
      defaultHidden: true,
      enableSorting: true,
    }),
    createDropdownTableColumn<TraceRow, string>({
      id: "action",
      accessorFn: (row) => row.id,
      header: "Action",
      size: 70,
      isFixedPosition: true,
      renderMenu: () => (
        <DropdownMenuItem className="text-destructive">
          <Trash className="mr-2 h-4 w-4" />
          Delete trace
        </DropdownMenuItem>
      ),
    }),
  ];
}

// -----------------------------------------------------------------------------
// Plain columns (simple data-state / pagination stories)
// -----------------------------------------------------------------------------
// A lightweight subset reusing the same faithful cells, for the data-state,
// pagination, and selection stories where the full Traces column set is noise.

const plainColumns: LangfuseColumnDef<TraceRow>[] = [
  createIdTableColumn<TraceRow>({ accessorKey: "id", header: "ID", size: 220 }),
  createTextTableColumn<TraceRow>({
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
    size: 180,
  }),
  createDateTableColumn<TraceRow>({
    accessorKey: "timestamp",
    header: "Timestamp",
    enableSorting: true,
    size: 200,
  }),
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

// Split-pane tables (trace/observation Scores) are often ~400px while the
// viewport is still lg, which used to wrap nav buttons off the page label.
export const NarrowPane = meta.story({
  render: () => (
    <div className="w-[400px] overflow-hidden rounded-md border">
      <PaginationStory mode="offset" />
    </div>
  ),
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

const LONG_IO_TRACE_ROW: TraceRow = {
  ...makeTraceRow(0),
  id: "trace-long-io-content",
  input: {
    request: "dataset-item-input",
    messages: Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `Message ${index + 1}: ${"This is deliberately long JSON content to verify that the fixed-height IO cell retains its vertical scrollbar. ".repeat(3)}`,
    })),
  },
  output: {
    result: "dataset-item-output",
    details: Object.fromEntries(
      Array.from({ length: 24 }, (_, index) => [
        `field-${index + 1}`,
        `Value ${index + 1}: ${"long output content ".repeat(8)}`,
      ]),
    ),
  },
  metadata: Object.fromEntries(
    Array.from({ length: 24 }, (_, index) => [
      `metadata-${index + 1}`,
      `value-${index + 1}`,
    ]),
  ),
};

function LongIOContentStory() {
  const columns = useMemo(() => buildTraceColumns("l"), []);
  return (
    <DataTable<TraceRow, unknown>
      tableName="story-long-io-content"
      columns={columns}
      data={{
        isLoading: false,
        isError: false,
        data: [LONG_IO_TRACE_ROW],
      }}
      pagination={{
        totalCount: 1,
        onChange: fn(),
        state: { pageIndex: 0, pageSize: 1 },
      }}
      rowHeight="l"
      cellPadding="comfortable"
    />
  );
}

export const LongIOContent = meta.story({
  render: () => <LongIOContentStory />,
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
      createNumberTableColumn<TraceRow>({
        accessorKey: "observationCount",
        header: "Observations",
        size: 110,
        formatter: (value) => numberFormatter(value, 0, 0),
      }),
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
      createNumberTableColumn<TraceRow>({
        id: "totalCostGrouped",
        accessorFn: (row) => row.totalCost.toNumber(),
        header: "Cost (USD)",
        size: 110,
        formatter: (value) => usdFormatter(value),
      }),
      createNumberTableColumn<TraceRow>({
        id: "totalTokensGrouped",
        accessorFn: (row) => row.usage.totalUsage,
        header: "Tokens",
        size: 100,
        formatter: (value) => numberFormatter(value, 0, 0),
      }),
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
//   - Name column: folder rows use the folder key column (TextLink + Folder
//     icon); prompt rows use TextLink to the prompt.
//   - Versions/Type: folder rows render null -> empty cells (column rhythm
//     visibly breaks between folder and prompt rows, as in production).
//   - "Latest Version Created At": LocalIsoDate, null on folder rows.
//   - "Number of Observations (7d)": TextLink wrapping the count (0 still links),
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
  createFolderKeyTableColumn<PromptRow>({
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
    size: 250,
    getCell: (name, { row }) => {
      if (!name) return undefined;
      const { type, fullPath } = row.original;
      if (type === "folder") {
        return { type: "folder", name, onClick: () => undefined };
      }

      return {
        type: "link",
        props: {
          path: `/prompts/${encodeURIComponent(fullPath)}`,
          value: name,
          title: fullPath,
        },
      };
    },
  }),
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
      const preparedDate = buildLocalIsoDatePresentation({
        date: row.original.createdAt,
      });

      return preparedDate ? (
        <span title={preparedDate.title}>{preparedDate.display}</span>
      ) : null;
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
      // are "loaded", so it always renders the TextLink (0 still links).
      if (n === undefined) {
        return <Skeleton className="h-3 w-1/2" />;
      }
      return (
        <TextLink
          path="/observations"
          value={n.toLocaleString()}
          title={n.toLocaleString()}
        />
      );
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
//   - plain IdTableCell (no icon)
//   - IdTableCell + trailing PlusCircle — mirrors features/models
//     ProvidedModelNameCell: the name is wrapped in `inline-flex items-center`
//     with the icon as a `shrink-0` adornment, so it lands on the same baseline
//     as the no-icon rows.
//   - TextLink with a leading icon (ListTree)
//   - Folder link (Folder icon)
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
          // Faithful to ProvidedModelNameCell: same IdTableCell + trailing
          // icon, in a native <button> trigger (keyboard-activatable).
          return (
            <button
              type="button"
              className="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 text-left"
            >
              <IdTableCell value={name} />
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
            </button>
          );
        case "link":
          return (
            <TextLink path="#" value={name} icon={ListTree} title={name} />
          );
        case "folder":
          return (
            <TextLink
              path=""
              value={name}
              icon={Folder}
              onClick={() => undefined}
              title={name}
            />
          );
        case "plain":
        default:
          return (
            <span className="inline-flex max-w-full min-w-0 items-center">
              <IdTableCell value={name} />
            </span>
          );
      }
    },
  },
  createTextTableColumn<IconCellRow>({
    accessorKey: "detail",
    header: "Status",
    size: 120,
  }),
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

export const PaginationControlsStayGrouped = meta.story({
  name: "(Test) Pagination Controls Stay Grouped",
  render: () => (
    <div className="w-[400px] overflow-hidden">
      <PaginationStory mode="offset" />
    </div>
  ),
  play: async ({ canvas }) => {
    const pageInput = await canvas.findByRole("spinbutton");
    const next = canvas.getByRole("button", { name: "Go to next page" });
    const prev = canvas.getByRole("button", { name: "Go to previous page" });

    expect(
      Math.abs(
        pageInput.getBoundingClientRect().top -
          next.getBoundingClientRect().top,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        prev.getBoundingClientRect().top - next.getBoundingClientRect().top,
      ),
    ).toBeLessThan(8);
    expect(
      canvas.queryByRole("button", { name: "Go to first page" }),
    ).toBeNull();
    expect(
      canvas.queryByRole("button", { name: "Go to last page" }),
    ).toBeNull();
  },
});

export const TestManualIOCellBackground = meta.story({
  name: "(Test) Manual IO Cell Background",
  render: () => (
    <TracesTable
      tableName="story-manual-io-background"
      rowHeight="s"
      cellPadding="compact"
    />
  ),
  play: async ({ canvasElement }) => {
    const headers = Array.from(canvasElement.querySelectorAll("thead th"));
    const inputIndex = headers.findIndex(
      (header) => header.textContent?.trim() === "Input",
    );
    const outputIndex = headers.findIndex(
      (header) => header.textContent?.trim() === "Output",
    );
    const row = canvasElement.querySelector<HTMLTableRowElement>("tbody tr");
    if (!row) throw new globalThis.Error("Row not found");

    await expect(row.cells[inputIndex]).toHaveClass("bg-muted/50");
    await expect(row.cells[outputIndex]).toHaveClass("bg-accent-light-green");
  },
});
