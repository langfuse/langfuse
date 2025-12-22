/**
 * JsonRowScrollable - Scrollable column content (indent + key + value + badges + copy)
 *
 * This component renders the right-side scrollable column that scrolls horizontally.
 * It contains the actual JSON content (indentation, keys, values, and action buttons).
 */

import type { FlatJSONRow, JSONTheme, SearchMatch } from "../types";
import { JsonKey } from "./JsonKey";
import { JsonValue } from "./JsonValue";
import { CopyButton } from "./CopyButton";

export interface JsonRowScrollableProps {
  row: FlatJSONRow;
  theme: JSONTheme;
  stringWrapMode?: "nowrap" | "truncate" | "wrap";
  truncateStringsAt?: number | null;
  matchCount?: number;
  currentMatchIndexInRow?: number;
  enableCopy?: boolean;
  searchMatch?: SearchMatch;
  isCurrentMatch?: boolean;
  className?: string;
  jsonPath?: string;
  commentRanges?: Array<{ start: number; end: number }>;
}

export function JsonRowScrollable({
  row,
  theme,
  stringWrapMode = "wrap",
  truncateStringsAt = null,
  matchCount,
  currentMatchIndexInRow,
  enableCopy = false,
  searchMatch,
  isCurrentMatch = false,
  className,
  jsonPath,
  commentRanges,
}: JsonRowScrollableProps) {
  const isKey = searchMatch?.matchType === "key";
  const isValue = searchMatch?.matchType === "value";

  // Calculate value offset within the row for adjusting comment ranges
  // Row renders as: key:"value" (no space after colon)
  // commentRanges are row-relative, need to adjust for value-only highlighting
  const keyLength = row.key.length;
  const colonAndQuoteLength = 2; // ":" + opening quote
  const valueOffset = keyLength + colonAndQuoteLength;

  // Calculate background based on search match only (comment highlighting is now character-level)
  const backgroundColor = isCurrentMatch
    ? theme.searchCurrentBackground
    : searchMatch
      ? theme.searchMatchBackground
      : "transparent";

  return (
    <div
      className={className}
      data-json-path={jsonPath}
      data-json-key-value="true"
      style={{
        display: "flex",
        alignItems: "start",
        flexWrap: "nowrap", // Prevent wrapping between key, colon, value, badges
        minHeight: `${theme.lineHeight}px`,
        paddingLeft: `${row.depth * theme.indentSize}px`, // Indentation
        paddingRight: "4px",
        backgroundColor,
        fontSize: theme.fontSize,
        lineHeight: `${theme.lineHeight}px`,
        fontFamily: "monospace",
        transition: "background-color 0.15s ease",
      }}
    >
      {/* Key name */}
      <JsonKey
        keyName={row.key}
        theme={theme}
        highlightStart={isKey ? searchMatch.highlightStart : undefined}
        highlightEnd={isKey ? searchMatch.highlightEnd : undefined}
        commentRanges={commentRanges}
      />

      {/* Colon separator */}
      <span
        style={{
          color: theme.punctuationColor,
          marginLeft: "2px",
          marginRight: "4px",
          flexShrink: 0, // Prevent colon from being compressed
        }}
      >
        :
      </span>

      {/* Value */}
      <JsonValue
        value={row.value}
        type={row.type}
        theme={theme}
        isExpandable={row.isExpandable}
        childCount={row.childCount}
        stringWrapMode={stringWrapMode}
        truncateStringsAt={truncateStringsAt}
        highlightStart={isValue ? searchMatch?.highlightStart : undefined}
        highlightEnd={isValue ? searchMatch?.highlightEnd : undefined}
        commentRanges={commentRanges}
        valueOffset={valueOffset}
      />

      {/* Match count badge (for collapsed rows or leaf nodes with multiple matches) */}
      {matchCount !== undefined &&
        matchCount > 1 &&
        ((row.isExpandable && !row.isExpanded) || !row.isExpandable) && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: "6px",
              padding: "0 4px",
              minWidth: "16px",
              height: "14px",
              fontSize: "9px",
              fontWeight: 600,
              borderRadius: "7px",
              backgroundColor: theme.searchMatchBackground,
              color: theme.foreground,
              border: `1px solid ${theme.searchCurrentBackground}`,
              flexShrink: 0,
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

      {/* Copy button (optional, on hover) */}
      {enableCopy && (
        <CopyButton value={row.value} theme={theme} className="mt-0.5" />
      )}
    </div>
  );
}
