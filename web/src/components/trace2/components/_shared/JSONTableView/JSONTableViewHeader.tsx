/**
 * JSONTableViewHeader - Table header generated from column definitions.
 *
 * Renders column headers with proper alignment and spacing.
 */

import { memo } from "react";
import { cn } from "@/src/utils/tailwind";
import { type JSONTableViewHeaderProps } from "./json-table-view-types";

/**
 * Table header component that renders column labels.
 */
function JSONTableViewHeaderInner<T>({
  columns,
  hasPrefix,
  hasExpandIcon,
}: JSONTableViewHeaderProps<T>) {
  return (
    <div className="flex min-h-6 items-center gap-2 border-b border-border bg-muted/50 px-3 py-0.5 text-xs font-medium text-muted-foreground">
      {/* Spacer for prefix content (e.g., tree indentation) */}
      {hasPrefix && <div className="w-3" />}

      {/* Spacer for expand icon */}
      {hasExpandIcon && <div className="w-3.5" />}

      {/* Column headers */}
      {columns.map((column) => (
        <div
          key={column.key}
          className={cn(
            "flex-shrink-0",
            column.width ?? "flex-1",
            column.align === "right" && "text-right",
          )}
        >
          {column.header}
        </div>
      ))}
    </div>
  );
}

export const JSONTableViewHeader = memo(
  JSONTableViewHeaderInner,
) as typeof JSONTableViewHeaderInner;
