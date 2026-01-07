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
  matchCount?: number;
  currentMatchIndexInRow?: number;
  onToggleExpansion?: (rowId: string) => void;
  stringWrapMode?: "nowrap" | "truncate" | "wrap";
  className?: string;
  isToggling?: boolean; // Show spinner when this row is being toggled
}

export function JsonRowFixed({
  row,
  theme,
  showLineNumber = false,
  lineNumber,
  maxLineNumberDigits,
  searchMatch,
  isCurrentMatch = false,
  matchCount,
  currentMatchIndexInRow,
  onToggleExpansion,
  stringWrapMode = "wrap",
  className,
  isToggling = false,
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
        position: "relative",
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
        isToggling={isToggling}
      />

      {/* Match count badge (positioned absolutely in top-right corner) */}
      {matchCount !== undefined &&
        matchCount > 1 &&
        ((row.isExpandable && !row.isExpanded) || !row.isExpandable) && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              minWidth: "16px",
              height: "14px",
              fontSize: "9px",
              fontWeight: 600,
              borderRadius: "7px",
              backgroundColor: theme.searchMatchBackground,
              color: theme.foreground,
              border: `1px solid ${theme.searchCurrentBackground}`,
              pointerEvents: "none", // Don't interfere with clicks
            }}
            title={
              row.isExpandable
                ? `${matchCount} match${matchCount === 1 ? "" : "es"} in this section`
                : `${matchCount} match${matchCount === 1 ? "" : "es"} in this value`
            }
          >
            {currentMatchIndexInRow !== undefined
              ? `${currentMatchIndexInRow}/${matchCount}`
              : matchCount}
          </span>
        )}
    </div>
  );
}
