/**
 * JSONTableViewRow - Row component for JSONTableView.
 *
 * Renders a single row with columns and handles expand/collapse.
 */

import { memo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { useClickWithoutSelection } from "@/src/hooks/useClickWithoutSelection";
import { type JSONTableViewRowProps } from "./json-table-view-types";

/**
 * Row component that renders column cells and handles expand/collapse.
 */
function JSONTableViewRowInner<T>({
  item,
  itemKey,
  index,
  columns,
  isExpanded,
  expandable,
  onToggle,
  renderExpanded,
  renderRowPrefix,
}: JSONTableViewRowProps<T>) {
  // Use click-without-selection to allow text selection while still supporting expand
  const { props: clickProps } = useClickWithoutSelection({
    onClick: onToggle,
    enabled: expandable,
  });

  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
  const expandedContentId = `expanded-content-${itemKey}`;

  return (
    <div className="border-b border-border bg-background">
      {/* Preview row - always visible */}
      <div
        className={cn(
          "flex min-h-6 items-center gap-2 px-3 py-0.5",
          expandable && "cursor-pointer hover:bg-muted/50",
          isExpanded && "border-b border-border/50 bg-muted/30",
        )}
        {...(expandable ? clickProps : {})}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? isExpanded : undefined}
        aria-controls={expandable ? expandedContentId : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        {/* Prefix content (e.g., tree indentation) */}
        {renderRowPrefix && renderRowPrefix(item, isExpanded)}

        {/* Expand icon */}
        {expandable && (
          <ChevronIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )}

        {/* Column cells */}
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              "flex-shrink-0 text-sm",
              column.width ?? "min-w-0 flex-1",
              column.align === "right" && "text-right",
              // Truncate flex-1 columns
              column.width === "flex-1" && "truncate",
            )}
          >
            {column.render(item, index)}
          </div>
        ))}
      </div>

      {/* Expanded content */}
      {isExpanded && renderExpanded && (
        <div id={expandedContentId} className="w-full">
          {renderExpanded(item)}
        </div>
      )}
    </div>
  );
}

export const JSONTableViewRow = memo(
  JSONTableViewRowInner,
) as typeof JSONTableViewRowInner;
