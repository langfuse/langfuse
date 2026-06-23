import preview from "../../../.storybook/preview";
import { useCallback, useMemo, useState } from "react";
import { fn } from "storybook/test";
import {
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { type OrderByState } from "@langfuse/shared";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/ui/checkbox";

// -----------------------------------------------------------------------------
// Mock data
// -----------------------------------------------------------------------------
// Realistic-ish trace-like rows: ids, ISO timestamps, names, a JSON-ish IO blob,
// numbers, badges. The IO blob is intentionally multi-line so it can be put next
// to a single-line numeric/badge column to surface the vertical-alignment issue
// (A1/A2 in the research inventory: a one-line value top-aligns next to a tall
// multi-line cell on m/l rows -> ragged top edge).

type DemoRow = {
  id: string;
  name: string;
  timestamp: string;
  environment: string;
  status: "success" | "error" | "running";
  latencyMs: number;
  totalCost: number;
  totalTokens: number;
  scoreHelpfulness: number;
  scoreGroundedness: number;
  user: string;
  // A long single string for the truncation column.
  description: string;
  // A multi-line JSON-ish blob for the "IO"-style column.
  io: string;
};

const NAMES = [
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
const STATUSES: DemoRow["status"][] = ["success", "error", "running"];
const USERS = ["alice@acme.io", "bob@acme.io", "carol@acme.io", "system"];

const LOREM =
  "This trace processed a multi-step retrieval-augmented generation request, " +
  "reranked the candidate documents, then synthesized a grounded answer with " +
  "inline citations and a confidence estimate for downstream evaluation.";

// Deterministic pseudo-random so stories are stable across reloads.
function seeded(n: number) {
  const x = Math.sin(n + 1) * 10000;
  return x - Math.floor(x);
}

function makeRow(index: number): DemoRow {
  const status = STATUSES[index % STATUSES.length]!;
  const name = NAMES[index % NAMES.length]!;
  const baseTime = Date.parse("2026-06-23T09:00:00.000Z");
  const ts = new Date(baseTime - index * 137_000).toISOString();
  return {
    id: `trace-${(index + 1).toString().padStart(5, "0")}-${Math.floor(
      seeded(index) * 1e6,
    )
      .toString(16)
      .padStart(5, "0")}`,
    name,
    timestamp: ts,
    environment: ENVIRONMENTS[index % ENVIRONMENTS.length]!,
    status,
    latencyMs: Math.round(200 + seeded(index) * 5800),
    totalCost: Number((seeded(index * 2) * 0.42).toFixed(4)),
    totalTokens: Math.round(500 + seeded(index * 3) * 18000),
    scoreHelpfulness: Number((0.5 + seeded(index * 5) * 0.5).toFixed(2)),
    scoreGroundedness: Number((0.4 + seeded(index * 7) * 0.6).toFixed(2)),
    user: USERS[index % USERS.length]!,
    description: `${name}: ${LOREM}`,
    io: JSON.stringify(
      {
        input: {
          query: `${name} request #${index + 1}`,
          environment: ENVIRONMENTS[index % ENVIRONMENTS.length],
        },
        output: {
          status,
          tokens: Math.round(500 + seeded(index * 3) * 18000),
          citations: ["doc-12", "doc-87", "doc-204"],
        },
      },
      null,
      2,
    ),
  };
}

const ALL_ROWS: DemoRow[] = Array.from({ length: 123 }, (_, i) => makeRow(i));

function statusVariant(
  status: DemoRow["status"],
): "success" | "error" | "secondary" {
  if (status === "success") return "success";
  if (status === "error") return "error";
  return "secondary";
}

// -----------------------------------------------------------------------------
// Columns
// -----------------------------------------------------------------------------
// The kitchen-sink column set exercises every custom LangfuseColumnDef field:
// isPinnedLeft, isFlexWidth, isFixedPosition, defaultHidden, headerTooltip,
// enableSorting (wired to orderBy/setOrderBy), grouped columns (score/cost),
// a custom-cell column, a long-text truncation column, and a multi-line IO cell
// next to a single-line numeric/badge cell.

const kitchenSinkColumns: LangfuseColumnDef<DemoRow>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "ID",
    // Pinned to the left (sticky). Note: pinned cells force an opaque
    // background, so hover/selected tint stops at the pin seam (E1/H1 in the
    // research inventory) - visible in the RowSelection / hover demos.
    isPinnedLeft: true,
    size: 220,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id}</span>
    ),
  },
  {
    accessorKey: "name",
    id: "name",
    header: "Name",
    // Flex-width column: width "auto", absorbs leftover horizontal space. Only
    // ONE column per table should set this (Monitors `name` is the sole real use).
    isFlexWidth: true,
    enableSorting: true,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "timestamp",
    id: "timestamp",
    header: "Timestamp",
    enableSorting: true,
    size: 200,
    headerTooltip: {
      description:
        "When the trace was recorded. Sortable: click the header to toggle ASC/DESC.",
    },
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.timestamp}</span>
    ),
  },
  {
    accessorKey: "environment",
    id: "environment",
    header: "Environment",
    // Fixed position: cannot be reordered in the Columns drawer.
    isFixedPosition: true,
    size: 130,
    cell: ({ row }) => (
      <Badge variant="outline-solid" size="sm">
        {row.original.environment}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    id: "status",
    header: "Status",
    size: 110,
    // Single-line badge cell. Placed right before the multi-line IO column so
    // the vertical-alignment issue is visible on m/l rows.
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)} size="sm">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "latencyMs",
    id: "latencyMs",
    header: "Latency",
    enableSorting: true,
    size: 110,
    // Single-line numeric cell (returns a string -> hits the string-cell branch).
    cell: ({ row }) => `${row.original.latencyMs.toLocaleString()} ms`,
  },
  {
    // Grouped header: "Scores" parent over two children. shouldRenderGroupHeaders
    // must be true for this two-row header to render (it is dead in production
    // because no caller passes the flag - the story exposes it).
    accessorKey: "scores",
    id: "scores",
    header: "Scores",
    columns: [
      {
        accessorKey: "scoreHelpfulness",
        id: "scoreHelpfulness",
        header: "Helpfulness",
        size: 110,
        cell: ({ row }) => row.original.scoreHelpfulness.toFixed(2),
      },
      {
        accessorKey: "scoreGroundedness",
        id: "scoreGroundedness",
        header: "Groundedness",
        size: 120,
        cell: ({ row }) => row.original.scoreGroundedness.toFixed(2),
      },
    ],
  },
  {
    // Grouped header: "Cost & usage" parent over two children.
    accessorKey: "usage",
    id: "usage",
    header: "Cost & usage",
    columns: [
      {
        accessorKey: "totalCost",
        id: "totalCost",
        header: "Cost (USD)",
        enableSorting: true,
        size: 110,
        cell: ({ row }) => `$${row.original.totalCost.toFixed(4)}`,
      },
      {
        accessorKey: "totalTokens",
        id: "totalTokens",
        header: "Tokens",
        enableSorting: true,
        size: 100,
        cell: ({ row }) => row.original.totalTokens.toLocaleString(),
      },
    ],
  },
  {
    accessorKey: "user",
    id: "user",
    header: "User",
    // Hidden by default; seeds the Columns drawer as unchecked. Toggle it via
    // columnVisibility (wired in the stateful wrapper) to see it appear.
    defaultHidden: true,
    size: 160,
  },
  {
    accessorKey: "description",
    id: "description",
    header: "Description (long, truncates)",
    size: 260,
    // Long single-line text -> on row height "s" this truncates; on m/l it wraps
    // in a flex column. Demonstrates the truncation behaviour (F1-F3).
    cell: ({ row }) => row.original.description,
  },
  {
    accessorKey: "io",
    id: "io",
    header: "Input / Output",
    size: 320,
    // Custom multi-line cell. Returns a ReactNode (NOT a string), so it hits the
    // non-string cell branch and renders the raw flex box. On m/l rows this is
    // much taller than the single-line Status/Latency cells next to it -> the
    // ragged-top vertical-alignment issue (A1/A2).
    cell: ({ row }) => (
      <pre className="max-h-full overflow-hidden text-[10px] leading-tight whitespace-pre-wrap">
        {row.original.io}
      </pre>
    ),
  },
];

// Plain column set (no groups) for the simpler data-state and pagination stories.
const plainColumns: LangfuseColumnDef<DemoRow>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "ID",
    isPinnedLeft: true,
    size: 220,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id}</span>
    ),
  },
  {
    accessorKey: "name",
    id: "name",
    header: "Name",
    enableSorting: true,
    size: 180,
  },
  {
    accessorKey: "timestamp",
    id: "timestamp",
    header: "Timestamp",
    enableSorting: true,
    size: 200,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.timestamp}</span>
    ),
  },
  {
    accessorKey: "status",
    id: "status",
    header: "Status",
    size: 110,
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)} size="sm">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "latencyMs",
    id: "latencyMs",
    header: "Latency",
    enableSorting: true,
    size: 120,
    cell: ({ row }) => `${row.original.latencyMs.toLocaleString()} ms`,
  },
];

// -----------------------------------------------------------------------------
// Stateful async wrapper
// -----------------------------------------------------------------------------
// Emulates a server-paginated table without any backend. Holds PaginationState;
// on pagination.onChange it flips isLoading=true, then after a short delay
// delivers the next slice with isLoading=false - mirroring the timer-driven
// async pattern from InAppAgentWindow.stories / FeaturePreviewModal.stories.

type PaginationMode = "offset" | "cursor" | "none";

function useAsyncPagedData({
  rows,
  pageSize,
  mode,
  latencyMs = 450,
}: {
  rows: DemoRow[];
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
      // Emulate a server round-trip: show skeletons, then deliver the new slice.
      setIsLoading(true);
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        window.setTimeout(() => setIsLoading(false), latencyMs);
        return next;
      });
    },
    [latencyMs],
  );

  const data: AsyncTableData<DemoRow[]> = {
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
            // Cursor mode: no exact total, only "is there a next page", and no
            // page jumping (Events / Billing tables).
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
// Story args (knobs) for the kitchen sink
// -----------------------------------------------------------------------------
// The four knobs are all genuine DataTable props, so the kitchen-sink story
// reads them off the (component-typed) story args directly.

type DataTableStoryArgs = {
  rowHeight?: RowHeight;
  cellPadding?: "compact" | "comfortable" | "none";
  topAlignCells?: boolean;
  shouldRenderGroupHeaders?: boolean;
};

// -----------------------------------------------------------------------------
// Meta
// -----------------------------------------------------------------------------
// DataTable is generic (`DataTable<TData, TValue>`). Storybook's CSF4
// `preview.meta({ component })` infers story args from the component's signature
// with its default generics (`TData = object`), which makes DemoRow-typed
// columns/data unassignable (function-arg contravariance). Pin the generic with
// a thin concrete-typed wrapper so all args infer at DemoRow.
type DataTableDemoProps = Parameters<typeof DataTable<DemoRow, unknown>>[0];

function DataTableDemo(props: DataTableDemoProps) {
  return <DataTable<DemoRow, unknown> {...props} />;
}

const meta = preview.meta({
  title: "Components/Table/DataTable",
  component: DataTableDemo,
  parameters: {
    // Sticky header/footer need a constrained-height parent, so render the
    // table inside a full-screen flex column.
    layout: "fullscreen",
  },
  // Baseline args satisfy DataTable's required props. Stories that need a
  // different shape (data states, pagination, selection) supply their own
  // `render`; the knob-driven KitchenSink reads rowHeight/cellPadding/etc.
  // off these args.
  args: {
    tableName: "story-data-table",
    columns: plainColumns,
    data: { isLoading: false, isError: false, data: ALL_ROWS.slice(0, 20) },
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
      data={{ isLoading: false, isError: false, data: ALL_ROWS.slice(0, 20) }}
      pagination={{
        totalCount: ALL_ROWS.length,
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
// `!data.data` branch and renders skeleton rows FOREVER - the error message is
// discarded and the user sees an infinite loading state. This story exists to
// expose that bug; the fix is to add a real error UI branch to TableBodyComponent.
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
// 2. Kitchen sink (everything on, with arg knobs)
// -----------------------------------------------------------------------------

function KitchenSinkStory(args: DataTableStoryArgs) {
  const { data, paginationProp } = useAsyncPagedData({
    rows: ALL_ROWS,
    pageSize: 10,
    mode: "offset",
  });

  // Sorting state wired to the sortable columns. Manual/server-side sorting:
  // DataTable just reports clicks via setOrderBy; the wrapper re-sorts and
  // the indicator (raw ▲/▼) reflects orderBy.
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "timestamp",
    order: "DESC",
  });

  // Column visibility seeded from defaultHidden so the drawer state is real.
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const initial: Record<string, boolean> = {};
    for (const col of kitchenSinkColumns) {
      if (col.defaultHidden && col.id) initial[col.id] = false;
    }
    return initial;
  });

  return (
    <DataTable
      tableName="story-kitchen-sink"
      columns={kitchenSinkColumns}
      data={data}
      pagination={paginationProp}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      rowHeight={args.rowHeight}
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
        "Render the two-row grouped header (Scores / Cost & usage). Dead path in production - no caller passes it.",
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
// 3. Pagination variants
// -----------------------------------------------------------------------------

function PaginationStory({ mode }: { mode: PaginationMode }) {
  const { data, paginationProp } = useAsyncPagedData({
    rows: ALL_ROWS,
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

// Exact total count, page-jumping enabled (the common case).
export const OffsetPagination = meta.story({
  render: () => <PaginationStory mode="offset" />,
});

// Cursor mode: totalCount null, hasNextPage drives navigation, canJumpPages
// false (Events v4 / Billing invoices). Click next/prev to fetch slices.
export const CursorPagination = meta.story({
  render: () => <PaginationStory mode="cursor" />,
});

// No pagination at all (Spend Alerts / Background Migrations) - footer hidden.
export const NoPagination = meta.story({
  render: () => <PaginationStory mode="none" />,
});

// -----------------------------------------------------------------------------
// 4. Row selection (authored checkbox column)
// -----------------------------------------------------------------------------
// The selection checkbox column is NOT part of DataTable - each table authors
// its own. Here we build one that toggles TanStack rowSelection. Note: because
// the ID column is pinned-left and pinned cells force an opaque background, the
// selected-row tint (bg-muted/40) stops at the pin seam (E1/H1).

function buildSelectionColumns(): LangfuseColumnDef<DemoRow>[] {
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
  const data: AsyncTableData<DemoRow[]> = {
    isLoading: false,
    isError: false,
    data: ALL_ROWS.slice(0, 20),
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
// 5. Density showcase
// -----------------------------------------------------------------------------
// Same data, three row heights side by side, to make alignment/density
// differences visible. The multi-line IO column next to single-line cells makes
// the ragged-top issue (A1/A2) obvious as height increases.

const densityData: AsyncTableData<DemoRow[]> = {
  isLoading: false,
  isError: false,
  data: ALL_ROWS.slice(0, 6),
};

const densityColumns: LangfuseColumnDef<DemoRow>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "ID",
    isPinnedLeft: true,
    size: 200,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id}</span>
    ),
  },
  {
    accessorKey: "status",
    id: "status",
    header: "Status",
    size: 100,
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)} size="sm">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "latencyMs",
    id: "latencyMs",
    header: "Latency",
    size: 100,
    cell: ({ row }) => `${row.original.latencyMs.toLocaleString()} ms`,
  },
  {
    accessorKey: "io",
    id: "io",
    header: "Input / Output",
    size: 320,
    cell: ({ row }) => (
      <pre className="max-h-full overflow-hidden text-[10px] leading-tight whitespace-pre-wrap">
        {row.original.io}
      </pre>
    ),
  },
];

function DensityPanel({ rowHeight }: { rowHeight: RowHeight }) {
  const label = { s: "Small (h-7)", m: "Medium (h-24)", l: "Large (h-64)" }[
    rowHeight
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-muted-foreground mb-1 text-xs font-medium">
        rowHeight = {rowHeight} — {label}
      </div>
      <div className="flex min-h-0 flex-1 flex-col border">
        <DataTable
          tableName={`story-density-${rowHeight}`}
          columns={densityColumns}
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
