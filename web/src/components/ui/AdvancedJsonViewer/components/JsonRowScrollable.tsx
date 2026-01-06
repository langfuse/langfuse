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
import { type CommentRange } from "../utils/commentRanges";

export interface JsonRowScrollableProps {
  row: FlatJSONRow;
  theme: JSONTheme;
  stringWrapMode?: "nowrap" | "truncate" | "wrap";
  truncateStringsAt?: number | null;
  enableCopy?: boolean;
  searchMatch?: SearchMatch;
  isCurrentMatch?: boolean;
  className?: string;
  jsonPath?: string;
  commentRanges?: CommentRange[];
  sectionKey?: string; // For inline comments - identifies which section (input/output/metadata) this row belongs to
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
  jsonPath,
  commentRanges,
  sectionKey,
}: JsonRowScrollableProps) {
  const isKey = searchMatch?.matchType === "key";
  const isValue = searchMatch?.matchType === "value";

  // Calculate value offset within the row for adjusting comment ranges
  // Row renders as: key:"value" for strings, key:value for others
  // commentRanges are row-relative, need to adjust for value-only highlighting
  const keyLength = String(row.key).length;
  const colonLength = 1;
  const quoteLength = row.type === "string" ? 1 : 0; // only strings have opening quote
  const valueOffset = keyLength + colonLength + quoteLength;

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
      data-section-key={sectionKey}
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

      {/* Copy button (optional, on hover) */}
      {enableCopy && (
        <CopyButton value={row.value} theme={theme} className="mt-0.5" />
      )}
    </div>
  );
}
