"use client";

import React, { useRef } from "react";
import { useRouter } from "next/router";
import { flexRender, type Cell, type Row } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import DocPopup from "@/src/components/layouts/doc-popup";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  type AsyncTableData,
  shouldIgnoreRowClickTarget,
} from "@/src/components/table/data-table";
import {
  type LangfuseColumnDef,
  type MobileCardSlot,
} from "@/src/components/table/types";
import {
  type TableSelectionStoreLike,
  useTableRowIsSelected,
  useTableSelectAll,
} from "@/src/components/table/table-selection-store";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";
import { cn } from "@/src/utils/tailwind";

// -----------------------------------------------------------------------------
// Mobile card list
// -----------------------------------------------------------------------------
// A vertical, virtualized alternative to the wide `table-fixed` body that the
// desktop DataTable renders. Instead of ~13 fixed 150px columns forcing 2600px
// of horizontal scroll on a phone, each row becomes a tappable card. Cards are
// assembled ENTIRELY from the table's own cell renderers via `flexRender`, so
// every formatter (dates, cost/latency/token, tags, level badge, IO preview,
// selection checkbox, star) is reused verbatim — this component owns layout,
// not presentation.
//
// Which cells appear, and where, is curated per table through the optional
// `mobileCard` column hint (see types.ts). Un-annotated columns are omitted.

interface DataTableMobileCardListProps<TData> {
  table: {
    getRowModel: () => { rows: Row<TData>[] };
  };
  data: AsyncTableData<TData[]>;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  selectionStore?: TableSelectionStoreLike;
  noResultsMessage?: React.ReactNode;
  help?: { description: string; href: string };
  getRowClassName?: (row: TData) => string;
}

type SlotBuckets<TData> = Record<MobileCardSlot, Cell<TData, unknown>[]>;

const EMPTY_BUCKETS: readonly MobileCardSlot[] = [
  "select",
  "badge",
  "title",
  "timestamp",
  "action",
  "metric",
  "context",
] as const;

// Group a row's visible cells into slot buckets, ordered within each slot by
// the column's `mobileCard.order` (ascending, default 0). Derived during
// render from the row model — no state, no effect.
function bucketCells<TData>(row: Row<TData>): SlotBuckets<TData> {
  const buckets: SlotBuckets<TData> = {
    select: [],
    badge: [],
    title: [],
    timestamp: [],
    action: [],
    metric: [],
    context: [],
  };
  for (const cell of row.getVisibleCells()) {
    const hint = (cell.column.columnDef as LangfuseColumnDef<TData>).mobileCard;
    if (hint) buckets[hint.slot].push(cell);
  }
  for (const slot of EMPTY_BUCKETS) {
    buckets[slot].sort((a, b) => {
      const ao =
        (a.column.columnDef as LangfuseColumnDef<TData>).mobileCard?.order ?? 0;
      const bo =
        (b.column.columnDef as LangfuseColumnDef<TData>).mobileCard?.order ?? 0;
      return ao - bo;
    });
  }
  return buckets;
}

function renderCell<TData>(cell: Cell<TData, unknown>): React.ReactNode {
  return flexRender(cell.column.columnDef.cell, cell.getContext());
}

// A short muted label for a metric, derived from the column header (falling
// back to the column id). Function headers can't be flattened to text here, so
// they fall back to the id.
function columnLabel<TData>(cell: Cell<TData, unknown>): string {
  const header = cell.column.columnDef.header;
  if (typeof header === "string") return header;
  return getPlainTextFromReactNode(header as React.ReactNode) ?? cell.column.id;
}

// A best-effort tooltip for the truncated title. Prefers the raw string value
// (name accessors return a string) and falls back to the flattened cell node.
function titleText<TData>(cell: Cell<TData, unknown>): string | undefined {
  const value = cell.getValue();
  if (typeof value === "string") return value;
  return getPlainTextFromReactNode(renderCell(cell));
}

// Wrapper that collapses itself when its rendered value produces no DOM
// content — this is how "skip a metric/context whose value is empty/nullish"
// is honored without introspecting cell return values: a cell that renders
// null leaves the value span (always the last child) `:empty`, and the
// structural `:has` variant hides the whole slot. No whitespace inside the
// value span, or `:empty` would not match. `break-words` keeps a long
// unbroken token from forcing horizontal overflow (no `truncate`, which would
// demand a static title on arbitrary rendered content).
function ValueSlot({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1",
        "[&:has(>span:last-child:empty)]:hidden",
        className,
      )}
    >
      {label ? (
        <span className="text-muted-foreground shrink-0">{label}</span>
      ) : null}
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function MobileCard<TData>({
  row,
  onRowClick,
  selectionStore,
  getRowClassName,
  measureRef,
  index,
}: {
  row: Row<TData>;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  selectionStore?: TableSelectionStoreLike;
  getRowClassName?: (row: TData) => string;
  measureRef: (el: HTMLElement | null) => void;
  index: number;
}) {
  const router = useRouter();
  const peekRowId = router.query.peek as string | undefined;
  const rowIsSelected = useTableRowIsSelected(
    selectionStore,
    row.id,
    row.getIsSelected(),
  );
  const shouldHighlightAllRows = useTableSelectAll(selectionStore, false);
  const isHighlighted =
    rowIsSelected ||
    shouldHighlightAllRows ||
    (!!peekRowId && peekRowId === row.id);

  const buckets = bucketCells(row);
  const isClickable = !!onRowClick;

  const title = buckets.title[0];

  return (
    <div ref={measureRef} data-index={index} className="px-2 pb-2">
      <div
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={
          isClickable
            ? (e) => {
                if (shouldIgnoreRowClickTarget(e.target)) return;
                onRowClick?.(row.original, e);
              }
            : undefined
        }
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key !== "Enter") return;
                if (shouldIgnoreRowClickTarget(e.target)) return;
                onRowClick?.(row.original);
              }
            : undefined
        }
        className={cn(
          "bg-background flex w-full min-w-0 flex-col gap-2 overflow-hidden rounded-md border p-3",
          isClickable && "hover:bg-accent cursor-pointer",
          isHighlighted && "bg-muted/40 dark:bg-muted",
          getRowClassName?.(row.original),
        )}
      >
        {/* Header line: select · badge · title · timestamp · action */}
        <div className="flex min-w-0 items-center gap-2">
          {buckets.select.map((cell) => (
            <span key={cell.id} className="shrink-0">
              {renderCell(cell)}
            </span>
          ))}
          {buckets.badge.map((cell) => (
            <span
              key={cell.id}
              className="shrink-0 [&:empty]:hidden [&:has(>span:empty)]:hidden"
            >
              {renderCell(cell)}
            </span>
          ))}
          {title ? (
            <span
              className="min-w-0 flex-1 truncate font-bold"
              title={titleText(title)}
            >
              {renderCell(title)}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {buckets.timestamp.map((cell) => (
            <span
              key={cell.id}
              className="text-muted-foreground shrink-0 text-xs"
            >
              {renderCell(cell)}
            </span>
          ))}
          {buckets.action.map((cell) => (
            <span key={cell.id} className="shrink-0">
              {renderCell(cell)}
            </span>
          ))}
        </div>

        {/* Metric strip: compact labelled values, wrapping, empties collapsed */}
        {buckets.metric.length > 0 ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {buckets.metric.map((cell) => (
              <ValueSlot key={cell.id} label={columnLabel(cell)}>
                {renderCell(cell)}
              </ValueSlot>
            ))}
          </div>
        ) : null}

        {/* Context line: tags, environment — wraps, never overflows */}
        {buckets.context.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {buckets.context.map((cell) => (
              <ValueSlot key={cell.id}>{renderCell(cell)}</ValueSlot>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DataTableMobileCardList<TData extends object>({
  table,
  data,
  onRowClick,
  selectionStore,
  noResultsMessage,
  help,
  getRowClassName,
}: DataTableMobileCardListProps<TData>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;

  // The virtualizer owns a real external system (the scroll container +
  // ResizeObserver-based measurement), which is the sanctioned use of an
  // effect — here it lives inside the library, not this component.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    // Key the measurement cache by row id (matching the React key) so that
    // reordering/filtering rows never reuses a neighbour's measured height —
    // cards have variable height (tags/metrics wrap over several lines).
    getItemKey: (index) => rows[index]!.id,
    overscan: 8,
  });

  const isLoading = data.isLoading || !data.data;

  return (
    <div
      ref={parentRef}
      className="relative min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto border-t py-2"
    >
      {isLoading ? (
        <div aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`mobile-card-skeleton-${i}`} className="px-2 pb-2">
              <div className="bg-background flex w-full flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                </div>
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : rows.length ? (
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!;
            return (
              <div
                key={row.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MobileCard
                  row={row}
                  index={virtualRow.index}
                  onRowClick={onRowClick}
                  selectionStore={selectionStore}
                  getRowClassName={getRowClassName}
                  measureRef={virtualizer.measureElement}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-muted-foreground flex h-24 items-center justify-center px-4 text-center text-sm">
          {noResultsMessage ?? (
            <>
              No results.{" "}
              {help && (
                <DocPopup description={help.description} href={help.href} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
