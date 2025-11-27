/**
 * LogViewTableHeader - Sticky column headers for the log view table.
 *
 * Displays column labels that stay fixed while rows scroll beneath.
 */

import { memo } from "react";
import { type LogViewTreeStyle } from "./log-view-types";

export interface LogViewTableHeaderProps {
  treeStyle: LogViewTreeStyle;
}

/**
 * Sticky table header with column labels.
 */
export const LogViewTableHeader = memo(function LogViewTableHeader({
  treeStyle,
}: LogViewTableHeaderProps) {
  return (
    <div className="flex min-h-6 items-center gap-2 border-b border-border bg-muted/50 px-3 py-0.5 pr-6 text-xs font-medium text-muted-foreground">
      {/* Spacer for tree indentation (in indented mode) */}
      {treeStyle === "indented" && <div className="w-3" />}

      {/* Spacer for expand icon */}
      <div className="w-3.5" />

      {/* Type column */}
      <div className="w-20 flex-shrink-0">Type</div>

      {/* Name column */}
      <div className="min-w-0 flex-1">Name</div>

      {/* Right-aligned columns: Depth, Duration, Time */}
      <div className="w-12 flex-shrink-0 text-right">Depth</div>
      <div className="w-16 flex-shrink-0 text-right">Duration</div>
      <div className="w-12 flex-shrink-0 text-right">Time</div>
    </div>
  );
});
