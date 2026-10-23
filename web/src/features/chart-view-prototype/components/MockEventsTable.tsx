import React, { type ComponentProps } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Table } from "@/src/components/design-system/table/Table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type ObservationLevel, type PrototypeEvent } from "../types";

const VISIBLE_ROWS = 14;

const LEVEL_COLOR: Record<
  ObservationLevel,
  ComponentProps<typeof Badge>["color"]
> = {
  ERROR: "red",
  WARNING: "yellow",
  DEFAULT: "filled",
  DEBUG: "filled",
};

const formatLatency = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

const formatCost = (usd: number): string =>
  usd === 0 ? "–" : `$${usd < 0.01 ? usd.toFixed(5) : usd.toFixed(4)}`;

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const compactColumn = {
  cellPadding: "compact" as const,
};

const columns: LangfuseColumnDef<PrototypeEvent>[] = [
  {
    ...compactColumn,
    accessorKey: "type",
    header: "Type",
    cell: ({ getValue }) =>
      getValue<PrototypeEvent["type"]>() ? (
        <Badge
          color="primary"
          size="sm"
          font="mono"
          text={getValue<PrototypeEvent["type"]>()}
        />
      ) : null,
  },
  createTextTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "name",
    header: "Name",
    cellClassName: "font-bold",
  }),
  createTextTableColumn<PrototypeEvent, PrototypeEvent["model"]>({
    ...compactColumn,
    accessorKey: "model",
    header: "Model",
    mapValue: (model) => model ?? "–",
    cellClassName: "text-muted-foreground font-mono",
  }),
  {
    ...compactColumn,
    accessorKey: "level",
    header: "Status",
    cell: ({ getValue }) => {
      const level = getValue<ObservationLevel>();
      return level ? (
        <Badge color={LEVEL_COLOR[level]} size="sm" text={level} />
      ) : null;
    },
  },
  createNumberTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "latencyMs",
    header: "Latency",
    formatter: formatLatency,
    headerClassName: "text-right",
    cellClassName: "text-right font-mono",
  }),
  createNumberTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "totalCost",
    header: "Cost",
    formatter: formatCost,
    headerClassName: "text-right",
    cellClassName: "text-right font-mono",
  }),
  createNumberTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "totalTokens",
    header: "Tokens",
    formatter: (tokens) => tokens.toLocaleString(),
    headerClassName: "text-right",
    cellClassName: "text-right font-mono",
  }),
  createTextTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "startTime",
    header: "Time",
    mapValue: (time) => (time ? formatTime(time) : undefined),
    headerClassName: "text-right",
    cellClassName: "text-muted-foreground text-right font-mono",
  }),
];

/**
 * A representative stand-in for the v4 events table — the "table" side of the
 * toggle. Deliberately a lightweight, view-only table (not the full virtualized
 * `DataTable`) so the prototype stays self-contained; it exists to make the
 * toggle feel honest, not to re-implement the real table.
 */
export const MockEventsTable = React.memo(function MockEventsTable({
  events,
}: {
  events: PrototypeEvent[];
}) {
  const rows = events.slice(0, VISIBLE_ROWS);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <Table
          tableName="Events"
          columns={columns}
          data={{ status: "success", data: rows }}
          noResultsMessage={null}
        />
      </div>
      <div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
        Showing {rows.length} of {events.length.toLocaleString()} events
      </div>
    </div>
  );
});
