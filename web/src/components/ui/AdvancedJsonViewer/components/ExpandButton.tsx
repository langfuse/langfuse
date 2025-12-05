/**
 * ExpandButton - Chevron button for expanding/collapsing rows
 *
 * Shows right chevron when collapsed, down chevron when expanded.
 * Positioned next to line numbers, not indented.
 */

import { ChevronRight, ChevronDown } from "lucide-react";
import { type JSONTheme } from "../types";

interface ExpandButtonProps {
  isExpanded: boolean;
  isExpandable: boolean;
  onClick: () => void;
  theme: JSONTheme;
}

export function ExpandButton({
  isExpanded,
  isExpandable,
  onClick,
  theme,
}: ExpandButtonProps) {
  if (!isExpandable) {
    // Empty placeholder to maintain alignment
    return <span className="inline-block w-4" />;
  }

  const Icon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center justify-center transition-opacity hover:opacity-70"
      style={{
        width: "16px",
        height: "16px",
        color: theme.expandButtonColor,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        opacity: 0.3,
      }}
      aria-label={isExpanded ? "Collapse" : "Expand"}
    >
      <Icon size={14} />
    </button>
  );
}
