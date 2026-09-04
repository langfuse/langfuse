import React from "react";
import { Badge } from "@/src/components/ui/badge";
import { SimpleDataTable } from "@/src/components/table/simple-data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { cn } from "@/src/utils/tailwind";
import { type ObservationLevel, type PrototypeEvent } from "../types";

const VISIBLE_ROWS = 14;

const LEVEL_CLASS: Record<ObservationLevel, string> = {
  ERROR: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  WARNING: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DEFAULT: "bg-muted text-muted-foreground",
  DEBUG: "bg-muted text-muted-foreground",
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
        <Badge variant="outline" className="font-mono text-[10px]">
          {getValue<PrototypeEvent["type"]>()}
        </Badge>
      ) : null,
  },
  createTextTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "name",
    header: "Name",
  }),
  createTextTableColumn<PrototypeEvent, PrototypeEvent["model"]>({
    ...compactColumn,
    accessorKey: "model",
    header: "Model",
    mapValue: (model) => model ?? "–",
  }),
  {
    ...compactColumn,
    accessorKey: "level",
    header: "Status",
    cell: ({ getValue }) => {
      const level = getValue<ObservationLevel>();
      return level ? (
        <Badge
          className={cn("border-transparent text-[10px]", LEVEL_CLASS[level])}
        >
          {level}
        </Badge>
      ) : null;
    },
  },
  createNumberTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "latencyMs",
    header: "Latency",
    formatter: formatLatency,
  }),
  createNumberTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "totalCost",
    header: "Cost",
    formatter: formatCost,
  }),
  createNumberTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "totalTokens",
    header: "Tokens",
    formatter: (tokens) => tokens.toLocaleString(),
  }),
  createTextTableColumn<PrototypeEvent>({
    ...compactColumn,
    accessorKey: "startTime",
    header: "Time",
    mapValue: (time) => (time ? formatTime(time) : undefined),
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
      <div className="min-h-0 flex-1 overflow-auto">
        <SimpleDataTable
          columns={columns}
          data={rows}
          isLoading={false}
          noResults={null}
          presentation="dense"
        />
      </div>
      <div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
        Showing {rows.length} of {events.length.toLocaleString()} events
      </div>
    </div>
  );
});
