import { ChevronRight, ChevronDown } from "lucide-react";
import { useSectionContext } from "../contexts/SectionContext";

export interface SimpleSectionHeaderProps {
  title: string;
  sectionKey: string;
}

/**
 * Simple collapsible section header
 *
 * Shows: [ChevronRight/ChevronDown] Title (N rows)
 *
 * Uses useSectionContext to access section state and toggle function
 */
export function SimpleSectionHeader({
  title,
  sectionKey,
}: SimpleSectionHeaderProps) {
  const context = useSectionContext(sectionKey);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 8px",
        cursor: "pointer",
        userSelect: "none",
        fontSize: "0.875rem",
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
      <span>{title}</span>
      <span style={{ marginLeft: "8px", color: "#6b7280", fontWeight: 400 }}>
        {context.rowCount} rows
      </span>
    </div>
  );
}
