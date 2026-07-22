import preview from "../../../.storybook/preview";
import { useState } from "react";
import { fn } from "storybook/test";
import {
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table";
import Decimal from "decimal.js";

import { DataTableMobileCardList } from "@/src/components/table/data-table-mobile-card-list";
import { type AsyncTableData } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/ui/checkbox";
import { StarToggle } from "@/src/components/star-toggle";
import TagList from "@/src/features/tag/components/TagList";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

// =============================================================================
// WHY THIS STORY RENDERS THE CARD LIST DIRECTLY
// =============================================================================
// `DataTableMobileCardList` is what `DataTable` swaps in on a mobile viewport
// (`useIsMobile() && a column carries a `mobileCard` hint`). `useIsMobile`
// resolves against the real viewport width via a `max-width` media query, so
// there is no reliable way to "force mobile" from a story and let DataTable
// pick the card branch. Instead we render the card list directly with a handful
// of faked rows and a small columns array carrying `mobileCard` hints. A thin
// wrapper builds a real TanStack table instance (the card list reads
// `getRowModel()` / `getVisibleCells()` / `flexRender`) from those columns. The
// decorator sizes the container like a phone so the vertical,
// horizontal-scroll-free layout is visible in the Storybook browser.
//
// The list is virtualized: it measures its scroll container and renders the
// cards that fit. The stories showcase the loaded / loading / empty states —
// no play functions, since assertions on virtualized layout are brittle.

// -----------------------------------------------------------------------------
// Deterministic mock data (mirrors the load-bearing TracesTableRow fields)
// -----------------------------------------------------------------------------

function seeded(n: number) {
  const x = Math.sin(n + 1) * 10000;
  return x - Math.floor(x);
}

const TRACE_NAMES = [
  "checkout-agent",
  "retrieval-pipeline",
  "summarizer-with-a-very-long-name-that-should-truncate",
  "qa-bot",
  "classification-job",
  "embedding-batch",
];
const ENVIRONMENTS = ["production", "staging", "development"];
const LEVELS = ["DEFAULT", "WARNING", "ERROR", "DEBUG"] as const;
const TAG_POOL = [
  ["production", "rag"],
  ["staging"],
  [],
  ["experimental", "latency-sensitive", "reviewed"],
];

type CardRow = {
  id: string;
  bookmarked: boolean;
  name: string;
  timestamp: Date;
  level: (typeof LEVELS)[number];
  latency: number;
  totalCost: Decimal;
  totalTokens: number;
  environment: string;
  tags: string[];
};

function makeRow(index: number): CardRow {
  const baseTime = Date.parse("2026-07-20T09:00:00.000Z");
  return {
    id: `trace-${(index + 1).toString().padStart(5, "0")}`,
    bookmarked: index % 4 === 0,
    name: TRACE_NAMES[index % TRACE_NAMES.length]!,
    timestamp: new Date(baseTime - index * 137_000),
    level: LEVELS[index % LEVELS.length]!,
    latency: Number((0.2 + seeded(index) * 18).toFixed(3)),
    totalCost: new Decimal(Number((seeded(index * 2) * 0.4).toFixed(6))),
    totalTokens: Math.round(300 + seeded(index * 3) * 6000),
    environment: ENVIRONMENTS[index % ENVIRONMENTS.length]!,
    tags: TAG_POOL[index % TAG_POOL.length]!,
  };
}

const ROWS: CardRow[] = Array.from({ length: 12 }, (_, i) => makeRow(i));

function loadedData(count = 8): AsyncTableData<CardRow[]> {
  return { isLoading: false, isError: false, data: ROWS.slice(0, count) };
}

const LEVEL_BADGE: Record<CardRow["level"], string> = {
  DEFAULT: "bg-muted text-muted-foreground",
  DEBUG: "bg-muted text-muted-foreground",
  WARNING: "bg-yellow-100 text-yellow-800",
  ERROR: "bg-red-100 text-red-800",
};

// A small, curated columns array — each carries a `mobileCard` slot hint, which
// is the only signal the card list reads to place a cell.
const columns: LangfuseColumnDef<CardRow>[] = [
  {
    accessorKey: "select",
    id: "select",
    header: "",
    size: 30,
    mobileCard: { slot: "select" },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
  },
  {
    accessorKey: "level",
    id: "level",
    header: "Level",
    mobileCard: { slot: "badge" },
    cell: ({ row }) => (
      <span
        className={`rounded-sm px-1 py-0.5 text-xs ${LEVEL_BADGE[row.original.level]}`}
      >
        {row.original.level}
      </span>
    ),
  },
  {
    accessorKey: "name",
    id: "name",
    header: "Name",
    mobileCard: { slot: "title" },
    cell: ({ row }) => row.original.name ?? undefined,
  },
  {
    accessorKey: "timestamp",
    id: "timestamp",
    header: "Timestamp",
    mobileCard: { slot: "timestamp" },
    cell: ({ row }) => <LocalIsoDate date={row.original.timestamp} />,
  },
  {
    accessorKey: "bookmarked",
    id: "bookmarked",
    header: "",
    mobileCard: { slot: "action" },
    cell: ({ row }) => <BookmarkCell defaultValue={row.original.bookmarked} />,
  },
  {
    accessorKey: "latency",
    id: "latency",
    header: "Latency",
    mobileCard: { slot: "metric", order: 0 },
    cell: ({ row }) => (
      <span>{formatIntervalSeconds(row.original.latency)}</span>
    ),
  },
  {
    accessorKey: "totalCost",
    id: "totalCost",
    header: "Cost",
    mobileCard: { slot: "metric", order: 1 },
    cell: ({ row }) => (
      <span>{usdFormatter(row.original.totalCost.toNumber())}</span>
    ),
  },
  {
    accessorKey: "totalTokens",
    id: "totalTokens",
    header: "Tokens",
    mobileCard: { slot: "metric", order: 2 },
    cell: ({ row }) => (
      <span>{numberFormatter(row.original.totalTokens, 0)}</span>
    ),
  },
  {
    accessorKey: "tags",
    id: "tags",
    header: "Tags",
    mobileCard: { slot: "context", order: 0 },
    cell: ({ row }) =>
      row.original.tags.length > 0 ? (
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <TagList
            selectedTags={row.original.tags}
            isLoading={false}
            viewOnly
          />
        </div>
      ) : null,
  },
  {
    accessorKey: "environment",
    id: "environment",
    header: "Environment",
    mobileCard: { slot: "context", order: 1 },
    cell: ({ row }) => (
      <Badge
        variant="secondary"
        className="max-w-fit truncate rounded-sm px-1 font-normal"
      >
        {row.original.environment}
      </Badge>
    ),
  },
];

function BookmarkCell({ defaultValue }: { defaultValue: boolean }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <StarToggle
      value={value}
      size="icon-xs"
      isLoading={false}
      onClick={async (next) => setValue(next)}
    />
  );
}

// -----------------------------------------------------------------------------
// Thin wrapper: build a real TanStack table from the columns + data, then hand
// it to the card list (which reads the row model + cell renderers).
// -----------------------------------------------------------------------------

type MobileCardListDemoProps = {
  data: AsyncTableData<CardRow[]>;
  onRowClick?: (row: CardRow) => void;
  noResultsMessage?: React.ReactNode;
};

function MobileCardListDemo({
  data,
  onRowClick,
  noResultsMessage,
}: MobileCardListDemoProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const table = useReactTable<CardRow>({
    data: data.data ?? [],
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  return (
    <DataTableMobileCardList<CardRow>
      table={table}
      data={data}
      onRowClick={onRowClick}
      noResultsMessage={noResultsMessage}
    />
  );
}

const meta = preview.meta({
  component: MobileCardListDemo,
  parameters: { layout: "centered" },
  args: {
    data: loadedData(),
    onRowClick: fn(),
  },
  decorators: [
    // Size the frame like a phone so the vertical, no-horizontal-scroll layout
    // is visible. The card list fills height and scrolls vertically only.
    (Story) => (
      <div className="bg-background flex h-[640px] w-[390px] flex-col overflow-hidden border">
        <Story />
      </div>
    ),
  ],
});

export default meta;

export const Default = meta.story({});

export const Loading = meta.story({
  args: {
    data: { isLoading: true, isError: false },
  },
});

export const Empty = meta.story({
  args: {
    data: { isLoading: false, isError: false, data: [] },
    noResultsMessage: "No traces match the current filters.",
  },
});
