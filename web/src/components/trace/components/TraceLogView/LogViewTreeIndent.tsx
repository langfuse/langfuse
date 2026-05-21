/**
 * LogViewTreeIndent - Tree indentation lines for log view rows.
 *
 * Renders visual tree lines connecting parent-child relationships.
 */

import { memo } from "react";
import { cn } from "@/src/utils/tailwind";

export interface LogViewTreeIndentProps {
  /** Array indicating which ancestor levels should show vertical lines */
  treeLines: boolean[];
  /** Whether this node is the last sibling at its level */
  isLastSibling: boolean;
  /** Current depth level */
  depth: number;
}

/**
 * Tree indentation with connecting lines.
 */
export const LogViewTreeIndent = memo(function LogViewTreeIndent({
  treeLines,
  isLastSibling,
  depth,
}: LogViewTreeIndentProps) {
  if (depth <= 0) return null;

  return (
    <div className="flex shrink-0">
      {/* Vertical lines for each ancestor level */}
      {treeLines.map((hasLine, index) => (
        <div key={index} className="relative w-3">
          {hasLine && (
            <div className="bg-border absolute top-0 bottom-0 left-1.5 w-px" />
          )}
        </div>
      ))}
      {/* Current level connector */}
      <div className="relative w-3">
        <div
          className={cn(
            "bg-border absolute top-0 left-1.5 w-px",
            isLastSibling ? "h-1/2" : "h-full",
          )}
        />
        <div className="bg-border absolute top-1/2 left-1.5 h-px w-1.5" />
      </div>
    </div>
  );
});
