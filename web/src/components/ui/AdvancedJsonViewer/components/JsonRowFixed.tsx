/**
 * JsonRowFixed - Fixed column content (line number + expand button)
 *
 * This component renders the left-side fixed column that doesn't scroll horizontally.
 * It contains only the UI chrome elements (line numbers and expand/collapse buttons).
 */

import type { FlatJSONRow, JSONTheme, SearchMatch } from "../types";
import { ExpandButton } from "./ExpandButton";
import { LineNumber } from "./LineNumber";

export interface JsonRowFixedProps {
  row: FlatJSONRow;
  theme: JSONTheme;
  showLineNumber?: boolean;
  lineNumber?: number;
  maxLineNumberDigits?: number;
  searchMatch?: SearchMatch;
  isCurrentMatch?: boolean;
  onToggleExpansion?: (rowId: string) => void;
  stringWrapMode?: "nowrap" | "truncate" | "wrap";
  className?: string;
}

export function JsonRowFixed({
  row,
  theme,
  showLineNumber = false,
  lineNumber,
  maxLineNumberDigits,
  searchMatch,
  isCurrentMatch = false,
  onToggleExpansion,
  stringWrapMode = "truncate",
  className,
}: JsonRowFixedProps) {
  // Calculate background based on search match
  const backgroundColor = isCurrentMatch
    ? theme.searchCurrentBackground
    : searchMatch
      ? theme.searchMatchBackground
      : "transparent";

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: stringWrapMode === "wrap" ? "start" : "center",
        minHeight: `${theme.lineHeight}px`,
        paddingLeft: "4px",
        paddingRight: "4px",
        backgroundColor,
        fontSize: theme.fontSize,
        lineHeight: `${theme.lineHeight}px`,
        fontFamily: "monospace",
        transition: "background-color 0.15s ease",
      }}
    >
      {/* Line number (optional) */}
      {showLineNumber && lineNumber !== undefined && (
        <LineNumber
          lineNumber={lineNumber}
          theme={theme}
          maxDigits={maxLineNumberDigits}
        />
      )}

      {/* Expand/collapse button */}
      <ExpandButton
        isExpanded={row.isExpanded}
        isExpandable={row.isExpandable}
        onClick={() => onToggleExpansion?.(row.id)}
        theme={theme}
      />
    </div>
  );
}
