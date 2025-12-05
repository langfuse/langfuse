/**
 * SimpleJsonViewer - Non-virtualized JSON viewer
 *
 * Renders all rows without virtualization.
 * Best for small datasets (<500 rows) where virtualization overhead isn't worth it.
 */

import { useMemo } from "react";
import { type FlatJSONRow, type SearchMatch, type JSONTheme } from "./types";
import { JsonRow } from "./components/JsonRow";

interface SimpleJsonViewerProps {
  rows: FlatJSONRow[];
  theme: JSONTheme;
  searchMatches?: SearchMatch[];
  currentMatchIndex?: number;
  showLineNumbers?: boolean;
  enableCopy?: boolean;
  truncateStringsAt?: number | null;
  wrapLongStrings?: boolean;
  onToggleExpansion?: (rowId: string) => void;
  className?: string;
}

export function SimpleJsonViewer({
  rows,
  theme,
  searchMatches = [],
  currentMatchIndex = 0,
  showLineNumbers = false,
  enableCopy = false,
  truncateStringsAt = null,
  wrapLongStrings = false,
  onToggleExpansion,
  className,
}: SimpleJsonViewerProps) {
  // Calculate maximum number of digits needed for line numbers
  const maxLineNumberDigits = useMemo(() => {
    return Math.max(1, Math.floor(Math.log10(rows.length)) + 1);
  }, [rows.length]);

  // Build a map of rowId -> match for quick lookup
  const matchMap = new Map<string, SearchMatch>();
  searchMatches.forEach((match) => {
    matchMap.set(match.rowId, match);
  });

  // Get current match for highlighting
  const currentMatch = searchMatches[currentMatchIndex];

  return (
    <div
      className={className}
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
        fontFamily: "monospace",
        overflow: "auto",
      }}
    >
      {rows.map((row, index) => {
        const searchMatch = matchMap.get(row.id);
        const isCurrentMatch = currentMatch?.rowId === row.id;

        return (
          <JsonRow
            key={row.id}
            row={row}
            theme={theme}
            searchMatch={searchMatch}
            isCurrentMatch={isCurrentMatch}
            showLineNumber={showLineNumbers}
            lineNumber={index + 1}
            enableCopy={enableCopy}
            truncateStringsAt={truncateStringsAt}
            wrapLongStrings={wrapLongStrings}
            onToggleExpansion={onToggleExpansion}
            maxLineNumberDigits={maxLineNumberDigits}
          />
        );
      })}

      {/* Empty state */}
      {rows.length === 0 && (
        <div
          className="flex items-center justify-center p-8 text-muted-foreground"
          style={{ fontSize: theme.fontSize }}
        >
          No data to display
        </div>
      )}
    </div>
  );
}
