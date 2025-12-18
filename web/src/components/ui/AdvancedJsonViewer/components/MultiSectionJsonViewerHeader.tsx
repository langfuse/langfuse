import { ChevronRight, ChevronDown } from "lucide-react";
import type { SectionContext } from "../types";

export interface MultiSectionJsonViewerHeaderProps {
  /** Display title for the section */
  title: string;
  /** Section context (expansion state, row count, toggle function) */
  context: SectionContext;
}

/**
 * Default section header for MultiSectionJsonViewer
 *
 * Shows: [ChevronRight/ChevronDown] Title (N rows)
 *
 * This is the fallback header used when no custom renderHeader is provided
 */
export function MultiSectionJsonViewerHeader({
  title,
  context,
}: MultiSectionJsonViewerHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 8px",
        cursor: "pointer",
        userSelect: "none",
        fontWeight: 500,
      }}
      onClick={() => context.setExpanded(!context.isExpanded)}
    >
      <span
        style={{
          marginRight: "8px",
          width: "16px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.5,
        }}
      >
        {context.isExpanded ? (
          <ChevronDown size={14} />
        ) : (
          <ChevronRight size={14} />
        )}
      </span>
      <span className="text-xs font-medium">{title}</span>
      <span
        style={{
          marginLeft: "8px",
          color: "#6b7280",
          fontWeight: 400,
          fontSize: "0.7rem",
        }}
      >
        {context.rowCount} rows
      </span>
    </div>
  );
}
