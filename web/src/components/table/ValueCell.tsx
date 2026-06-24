import { memo, type JSX, useState } from "react";
import { useRouter } from "next/router";
import { type Row } from "@tanstack/react-table";
import { urlRegex } from "@langfuse/shared";
import { type JsonTableRow } from "@/src/components/table/utils/jsonExpansionUtils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  buildEventsTablePathForMetadataFilter,
  type MetadataFilterOperator,
} from "@/src/features/events/lib/eventsTablePaths";
import { Copy, Check, EllipsisVertical, Filter, FilterX } from "lucide-react";

/**
 * Enables the per-row actions menu in a metadata JSON view: copy value/
 * structure/path plus "Include in / Exclude from filter" shortcuts that land on
 * the matching events table. Passed only by the metadata view, so input/output
 * cells keep their plain one-click copy button.
 */
export type MetadataFilterActions = {
  projectId: string;
  filterTarget: "observations" | "traces";
};

const MAX_STRING_LENGTH_FOR_LINK_DETECTION = 1500;
export const MAX_CELL_DISPLAY_CHARS = 2000;
const SMALL_ARRAY_THRESHOLD = 5;
const ARRAY_PREVIEW_ITEMS = 3;
const OBJECT_PREVIEW_KEYS = 2;
const MONO_TEXT_CLASSES = "font-mono text-xs wrap-break-word";
const PREVIEW_TEXT_CLASSES = "italic text-gray-500 dark:text-gray-400";

function renderStringWithLinks(text: string): React.ReactNode {
  if (text.length >= MAX_STRING_LENGTH_FOR_LINK_DETECTION) {
    return text;
  }

  const localUrlRegex = new RegExp(urlRegex.source, "gi");
  const parts = text.split(localUrlRegex);
  const matches = text.match(localUrlRegex) || [];

  const result: React.ReactNode[] = [];
  let matchIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      result.push(parts[i]);
    }

    if (matchIndex < matches.length) {
      const url = matches[matchIndex];
      result.push(
        <a
          key={`link-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80"
          onClick={(e) => e.stopPropagation()} // no row expansion when clicking links
        >
          {url}
        </a>,
      );
      matchIndex++;
    }
  }

  return result;
}

function getValueType(value: unknown): JsonTableRow["type"] {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonTableRow["type"];
}

function renderArrayValue(arr: unknown[]): JSX.Element {
  if (arr.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty list</span>;
  }

  if (arr.length <= SMALL_ARRAY_THRESHOLD) {
    // Show inline values for small arrays
    const displayItems = arr
      .map((item) => {
        const itemType = getValueType(item);
        if (itemType === "string") return `"${String(item)}"`;
        if (itemType === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          const keys = Object.keys(obj);
          if (keys.length === 0) return "{}";
          if (keys.length <= OBJECT_PREVIEW_KEYS) {
            const keyPreview = keys.map((k) => `"${k}": ...`).join(", ");
            return `{${keyPreview}}`;
          }
          return `{"${keys[0]}": ...}`;
        }
        if (itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return <span className={PREVIEW_TEXT_CLASSES}>[{displayItems}]</span>;
  }
  // Show truncated values for large arrays
  const preview = arr
    .slice(0, ARRAY_PREVIEW_ITEMS)
    .map((item) => {
      const itemType = getValueType(item);
      if (itemType === "string") return `"${String(item)}"`;
      if (itemType === "object" || itemType === "array") return "...";
      return String(item);
    })
    .join(", ");
  return (
    <span className={PREVIEW_TEXT_CLASSES}>
      [{preview}, ...{arr.length - ARRAY_PREVIEW_ITEMS} more]
    </span>
  );
}

function renderObjectValue(obj: Record<string, unknown>): JSX.Element {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty object</span>;
  }
  return <span className={PREVIEW_TEXT_CLASSES}>{keys.length} items</span>;
}

function getValueStringLength(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function getTruncatedValue(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const truncated = value.substring(0, maxChars);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  // Try to truncate at word boundary if possible
  if (lastSpaceIndex > maxChars * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + "...";
  }

  return truncated + "...";
}

function getCopyValue(value: unknown): string {
  if (typeof value === "string") {
    return value; // Return string without quotes
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Walks up to the top-level (level 0) ancestor key for a metadata row. */
function resolveTopLevelMetadataKey(row: Row<JsonTableRow>): string {
  let cursor: Row<JsonTableRow> | undefined = row;
  while (cursor && cursor.original.level > 0) {
    cursor = cursor.getParentRow() ?? undefined;
  }
  return cursor?.original.key ?? row.original.key;
}

/**
 * Builds the dotted key path from the row's actual keys (root → leaf). Unlike
 * `convertRowIdToKeyPath`, which reconstructs the path from the hyphen-joined
 * row id, this is lossless for keys that themselves contain `-` (e.g.
 * `x-request-id`).
 */
function resolveKeyPath(row: Row<JsonTableRow>): string {
  const keys: string[] = [];
  let cursor: Row<JsonTableRow> | undefined = row;
  while (cursor) {
    keys.unshift(String(cursor.original.key));
    cursor = cursor.getParentRow() ?? undefined;
  }
  return keys.join(".");
}

/**
 * The per-row overflow menu shown in metadata views. Containers offer "Copy
 * structure"; scalar leaves offer "Copy value" plus filter shortcuts. Rendered
 * only when `metadataActions` is provided, so `useRouter` stays off the hot
 * path for the (far more numerous) input/output JSON cells.
 */
function ValueCellActionsMenu({
  row,
  metadataActions,
}: {
  row: Row<JsonTableRow>;
  metadataActions: MetadataFilterActions;
}) {
  const router = useRouter();
  const { value, type, hasChildren, level } = row.original;

  const filterValue = String(value);
  // A nested value is matched as a substring of its JSON-ENCODED top-level
  // branch, but `filterValue` is the JSON-parsed (unescaped) form shown in the
  // tree. When the value carries JSON-escapable characters (quotes,
  // backslashes, newlines) the two differ, so `contains` would never match —
  // hide the shortcut rather than build a confidently-wrong filter.
  //
  // Top-level scalars are *usually* stored raw (ingestion keeps top-level
  // strings as-is), so we skip the check there. This heuristic misses the rare
  // case of a top-level value that was itself JSON-encoded with escapes; we
  // accept that miss because the alternative — always applying the check —
  // would wrongly hide the far more common top-level raw string with literal
  // newlines (which filters fine), since its encoded form also differs.
  const valueMatchesStoredForm =
    level === 0 || JSON.stringify(filterValue).slice(1, -1) === filterValue;
  const isScalarLeaf =
    !hasChildren &&
    (type === "string" || type === "number" || type === "boolean") &&
    // Skip empty values: `contains ""` matches every row (ClickHouse
    // position(x, "") === 1, and Map[missingKey] defaults to "") while
    // `does not contain ""` matches none — both shortcuts would be no-ops.
    filterValue.length > 0 &&
    valueMatchesStoredForm;

  // Metadata is a flat Map(String, String), so a nested value can only be
  // matched as a substring of its top-level branch. We use contains/does not
  // contain uniformly (top-level included) so Include and Exclude stay exact
  // complements — stringObject has no "!=" to invert an exact "=".
  const metadataKey = resolveTopLevelMetadataKey(row);
  const includeOperator: MetadataFilterOperator = "contains";
  const excludeOperator: MetadataFilterOperator = "does not contain";
  const displayValue = type === "string" ? `"${filterValue}"` : filterValue;

  const handleCopyData = () => {
    copyTextToClipboard(getCopyValue(value));
  };
  const handleCopyPath = () => {
    copyTextToClipboard(resolveKeyPath(row));
  };
  const navigateWithFilter = (operator: MetadataFilterOperator) => {
    router.push(
      buildEventsTablePathForMetadataFilter({
        currentPath: router.asPath,
        projectId: metadataActions.projectId,
        metadataKey,
        value: filterValue,
        operator,
        target: metadataActions.filterTarget,
      }),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Value actions"
          title="Actions"
          className="bg-background/80 hover:bg-background absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 border p-0 opacity-0 shadow-xs transition-opacity duration-200 group-hover:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <EllipsisVertical className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-[320px]"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem className="text-xs" onSelect={handleCopyData}>
          <Copy className="mr-2 h-3.5 w-3.5 shrink-0" />
          {hasChildren ? "Copy structure" : "Copy value"}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onSelect={handleCopyPath}>
          <Copy className="mr-2 h-3.5 w-3.5 shrink-0" />
          Copy path
        </DropdownMenuItem>
        {isScalarLeaf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => navigateWithFilter(includeOperator)}
            >
              <Filter className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span>Include in filter</span>
                <span className="text-muted-foreground truncate font-mono">
                  metadata.{metadataKey} {includeOperator} {displayValue}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => navigateWithFilter(excludeOperator)}
            >
              <FilterX className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span>Exclude from filter</span>
                <span className="text-muted-foreground truncate font-mono">
                  metadata.{metadataKey} {excludeOperator} {displayValue}
                </span>
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ValueCell = memo(
  ({
    row,
    expandedCells,
    toggleCellExpansion,
    preserveStringWhitespace = false,
    metadataActions,
  }: {
    row: Row<JsonTableRow>;
    expandedCells: Set<string>;
    toggleCellExpansion: (cellId: string) => void;
    preserveStringWhitespace?: boolean;
    metadataActions?: MetadataFilterActions;
  }) => {
    const { value, type } = row.original;
    const cellId = `${row.id}-value`;
    const isCellExpanded = expandedCells.has(cellId);
    const [showCopySuccess, setShowCopySuccess] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const copyValue = getCopyValue(value);

      try {
        await copyTextToClipboard(copyValue);
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 1500);
      } catch {
        // Copy failed silently
      }
    };

    const getDisplayValue = () => {
      switch (type) {
        case "string": {
          const stringValue = String(value);
          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS;
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue;

          return {
            content: (
              <span
                className={`text-green-600 dark:text-green-400 ${
                  preserveStringWhitespace
                    ? "whitespace-pre-wrap"
                    : "whitespace-pre-line"
                }`}
              >
                &quot;{renderStringWithLinks(displayValue)}&quot;
              </span>
            ),
            needsTruncation,
          };
        }
        case "number":
          return {
            content: (
              <span className="text-blue-600 dark:text-blue-400">
                {String(value)}
              </span>
            ),
            needsTruncation: false,
          };
        case "boolean":
          return {
            content: (
              <span className="text-orange-600 dark:text-orange-400">
                {String(value)}
              </span>
            ),
            needsTruncation: false,
          };
        case "null":
          return {
            content: (
              <span className="text-gray-500 italic dark:text-gray-400">
                null
              </span>
            ),
            needsTruncation: false,
          };
        case "undefined":
          return {
            content: (
              <span className="text-gray-500 dark:text-gray-400">
                undefined
              </span>
            ),
            needsTruncation: false,
          };
        case "array": {
          const arrayValue = value as unknown[];
          // Arrays always show previews, never truncate
          return {
            content: renderArrayValue(arrayValue),
            needsTruncation: false,
          };
        }
        case "object": {
          const objectValue = value as Record<string, unknown>;
          // Objects always show previews, never truncate
          return {
            content: renderObjectValue(objectValue),
            needsTruncation: false,
          };
        }
        default: {
          const stringValue = String(value);
          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS;
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue;

          return {
            content: (
              <span className="text-gray-600 dark:text-gray-400">
                {displayValue}
              </span>
            ),
            needsTruncation,
          };
        }
      }
    };

    const { content, needsTruncation } = getDisplayValue();

    return (
      <div className={`${MONO_TEXT_CLASSES} group relative max-w-full`}>
        <span className="cursor-text">{content}</span>
        {needsTruncation && !row.original.hasChildren && (
          <div
            className="inline cursor-pointer opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              toggleCellExpansion(cellId);
            }}
          >
            {isCellExpanded
              ? "\n...collapse"
              : `\n...expand (${getValueStringLength(value) - MAX_CELL_DISPLAY_CHARS} more characters)`}
          </div>
        )}

        {/* Hover affordance: a one-click copy by default, or an actions menu
            (copy + filter shortcuts) in metadata views. */}
        {metadataActions ? (
          <ValueCellActionsMenu row={row} metadataActions={metadataActions} />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="bg-background/80 hover:bg-background absolute top-0 right-0 h-5 w-5 border p-0.5 opacity-0 shadow-xs transition-opacity duration-200 group-hover:opacity-100"
            onClick={handleCopy}
            title="Copy value"
            aria-label="Copy cell value"
          >
            {showCopySuccess ? (
              <Check className="h-2.5 w-2.5 text-green-600" />
            ) : (
              <Copy className="h-2.5 w-2.5" />
            )}
          </Button>
        )}
      </div>
    );
  },
);

ValueCell.displayName = "ValueCell";

// Export utilities that might be needed elsewhere
export { getValueStringLength };
