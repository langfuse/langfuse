import { ChevronRight, ChevronDown } from "lucide-react";
import type { SectionContext } from "../types";
import { type MediaReturnType } from "@/src/features/media/validation";
import { MediaButtonGroup } from "./MediaButtonGroup";

export interface MultiSectionJsonViewerHeaderProps {
  /** Display title for the section */
  title: string;
  /** Section context (expansion state, row count, toggle function) */
  context: SectionContext;
  /** Media attachments for this section (optional) */
  media?: MediaReturnType[];
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
  media,
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
          fontSize: "0.65rem",
        }}
      >
        {context.rowCount.toLocaleString()} keys
      </span>
      <div style={{ marginLeft: "auto" }}>
        {media && media.length > 0 && <MediaButtonGroup media={media} />}
      </div>
    </div>
  );
}
