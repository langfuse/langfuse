/**
 * JsonRow - Complete row renderer combining all sub-components
 *
 * Renders a single JSON row with:
 * - Optional line number
 * - Expand/collapse button (for expandable values)
 * - Indentation based on depth
 * - Key name
 * - Colon separator
 * - Value (with type-based styling)
 * - Optional copy button
 * - Search highlighting
 */

import { type JsonRowProps } from "../types";
import { JsonKey } from "./JsonKey";
import { JsonValue } from "./JsonValue";
import { ExpandButton } from "./ExpandButton";
import { LineNumber } from "./LineNumber";
import { CopyButton } from "./CopyButton";

export function JsonRow({
  row,
  theme,
  searchMatch,
  isCurrentMatch = false,
  matchCount,
  currentMatchIndexInRow,
  showLineNumber = false,
  lineNumber,
  enableCopy = false,
  stringWrapMode = "truncate",
  truncateStringsAt = null,
  onToggleExpansion,
  maxLineNumberDigits,
  className,
}: JsonRowProps) {
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
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "start",
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
      {/* Column 1: Line number + expand button + indent + key + colon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: `${theme.lineHeight}px`,
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

        {/* Indentation */}
        <span
          style={{
            display: "inline-block",
            width: `${row.depth * theme.indentSize}px`,
          }}
        />

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
          }}
        >
          :
        </span>
      </div>

      {/* Column 2: Value + badge + copy button */}
      <div
        style={{
          minHeight: `${theme.lineHeight}px`,
          display: "flex",
          alignItems: "start",
          wordBreak: "break-word",
        }}
      >
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
    </div>
  );
}
