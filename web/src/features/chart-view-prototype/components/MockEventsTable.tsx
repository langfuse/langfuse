import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";
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
        <Table>
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow>
              <TableHead className="h-8">Type</TableHead>
              <TableHead className="h-8">Name</TableHead>
              <TableHead className="h-8">Model</TableHead>
              <TableHead className="h-8">Level</TableHead>
              <TableHead className="h-8 text-right">Latency</TableHead>
              <TableHead className="h-8 text-right">Cost</TableHead>
              <TableHead className="h-8 text-right">Tokens</TableHead>
              <TableHead className="h-8 text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} className="text-xs">
                <TableCell className="py-1.5">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {e.type}
                  </Badge>
                </TableCell>
                <TableCell className="py-1.5 font-bold">{e.name}</TableCell>
                <TableCell className="text-muted-foreground py-1.5 font-mono">
                  {e.model ?? "–"}
                </TableCell>
                <TableCell className="py-1.5">
                  <Badge
                    className={cn(
                      "border-transparent text-[10px]",
                      LEVEL_CLASS[e.level],
                    )}
                  >
                    {e.level}
                  </Badge>
                </TableCell>
                <TableCell className="py-1.5 text-right font-mono">
                  {formatLatency(e.latencyMs)}
                </TableCell>
                <TableCell className="py-1.5 text-right font-mono">
                  {formatCost(e.totalCost)}
                </TableCell>
                <TableCell className="py-1.5 text-right font-mono">
                  {e.totalTokens.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground py-1.5 text-right font-mono">
                  {formatTime(e.startTime)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
        Showing {rows.length} of {events.length.toLocaleString()} events
      </div>
    </div>
  );
});
