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
  enableCopy?: boolean;
  searchMatch?: SearchMatch;
  isCurrentMatch?: boolean;
  className?: string;
}

export function JsonRowScrollable({
  row,
  theme,
  stringWrapMode = "wrap",
  truncateStringsAt = null,
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

      {/* Copy button (optional, on hover) */}
      {enableCopy && (
        <CopyButton value={row.value} theme={theme} className="mt-0.5" />
      )}
    </div>
  );
}
