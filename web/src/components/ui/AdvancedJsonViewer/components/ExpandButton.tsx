/**
 * ExpandButton - Chevron button for expanding/collapsing rows
 *
 * Shows right chevron when collapsed, down chevron when expanded.
 * Shows spinner when toggling.
 * Positioned next to line numbers, not indented.
 */

import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { type JSONTheme } from "../types";

interface ExpandButtonProps {
  isExpanded: boolean;
  isExpandable: boolean;
  onClick: () => void;
  theme: JSONTheme;
  isToggling?: boolean; // Show spinner when toggling
}

export function ExpandButton({
  isExpanded,
  isExpandable,
  onClick,
  theme,
  isToggling = false,
}: ExpandButtonProps) {
  if (!isExpandable) {
    // Empty placeholder to maintain alignment
    return <span className="inline-block w-4" />;
  }

  // Show spinner when toggling, otherwise show chevron
  const Icon = isToggling ? Loader2 : isExpanded ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center justify-center transition-opacity hover:opacity-70 ${isToggling ? "animate-spin" : ""}`}
      style={{
        width: "16px",
        height: "16px",
        color: theme.expandButtonColor,
        background: "transparent",
        border: "none",
        cursor: isToggling ? "wait" : "pointer",
        padding: 0,
        opacity: isToggling ? 0.5 : 0.3,
      }}
      aria-label={
        isToggling ? "Processing..." : isExpanded ? "Collapse" : "Expand"
      }
      disabled={isToggling}
    >
      <Icon size={14} />
    </button>
  );
}
