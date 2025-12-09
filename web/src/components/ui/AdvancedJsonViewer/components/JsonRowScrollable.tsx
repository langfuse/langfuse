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
}

export function JsonRowScrollable({
  row,
  theme,
  stringWrapMode = "truncate",
  truncateStringsAt = null,
  matchCount,
  currentMatchIndexInRow,
  enableCopy = false,
  searchMatch,
  isCurrentMatch = false,
  className,
}: JsonRowScrollableProps) {
  const isKey = searchMatch?.matchType === "key";
  const isValue = searchMatch?.matchType === "value";

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
      {enableCopy && <CopyButton value={row.value} theme={theme} />}
    </div>
  );
}
