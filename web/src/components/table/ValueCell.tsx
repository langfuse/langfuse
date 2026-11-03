import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { memo, type ComponentProps, type JSX, useState } from "react";
import { type Row } from "@tanstack/react-table";
import { urlRegex } from "@langfuse/shared";
import {
  SMALL_ARRAY_THRESHOLD,
  SMALL_OBJECT_THRESHOLD,
  objectFitsInSingleRowPreview,
  type JsonTableRow,
} from "@/src/components/table/utils/jsonExpansionUtils";
import { classifyMediaValue } from "@/src/components/ui/media/mediaUtils";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { Button } from "@/src/components/ui/button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { cn } from "@/src/utils/tailwind";
import { Copy, Check, EllipsisVertical } from "@langfuse/icons";

const MAX_STRING_LENGTH_FOR_LINK_DETECTION = 1500;
const MAX_CELL_DISPLAY_CHARS = 2000;
const ARRAY_PREVIEW_ITEMS = 3;
const VALUE_TEXT_CLASSES = "font-mono text-xs/5 wrap-break-word";
const PREVIEW_TEXT_CLASSES = "text-gray-500 dark:text-gray-400";

const ROW_ACTION_BUTTON_CLASSES =
  "text-muted-foreground absolute top-0 h-5 w-5 rounded-sm p-0 opacity-0 transition-opacity duration-200 group-hover/value-cell:opacity-100 hover:bg-transparent hover:text-foreground";
const ROW_COPY_OFFSET = "-right-0.5";

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

function arrayPreviewText(arr: unknown[]): string {
  if (arr.length === 0) return "empty list";

  if (arr.length <= SMALL_ARRAY_THRESHOLD) {
    // Show inline values for small arrays
    const displayItems = arr
      .map((item) => {
        const itemType = getValueType(item);
        if (itemType === "string") return JSON.stringify(item);
        if (itemType === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          const keys = Object.keys(obj);
          if (keys.length === 0) return "{}";
          if (keys.length <= SMALL_OBJECT_THRESHOLD) {
            const keyPreview = keys.map((k) => `"${k}": ...`).join(", ");
            return `{${keyPreview}}`;
          }
          return `{"${keys[0]}": ...}`;
        }
        if (itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return `[${displayItems}]`;
  }
  // Show truncated values for large arrays
  const preview = arr
    .slice(0, ARRAY_PREVIEW_ITEMS)
    .map((item) => {
      const itemType = getValueType(item);
      if (itemType === "string") return JSON.stringify(item);
      if (itemType === "object" || itemType === "array") return "...";
      return String(item);
    })
    .join(", ");
  return `[${preview}, ...${arr.length - ARRAY_PREVIEW_ITEMS} more]`;
}

function renderPreview(text: string): JSX.Element {
  return <span className={PREVIEW_TEXT_CLASSES}>{text}</span>;
}

function formatPreviewPrimitive(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  return String(value);
}

function formatShortObjectPreview(obj: Record<string, unknown>): string | null {
  if (!objectFitsInSingleRowPreview(obj)) return null;
  const fields = Object.entries(obj).map(
    ([key, field]) =>
      `${JSON.stringify(key)}: ${formatPreviewPrimitive(field)}`,
  );
  return `{${fields.join(", ")}}`;
}

function objectPreviewText(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "empty object";
  return formatShortObjectPreview(obj) ?? `${keys.length} items`;
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

export function getCopyValue(value: unknown): string {
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

export const ValueCell = memo(
  ({
    row,
    expandedCells,
    toggleCellExpansion,
    preserveStringWhitespace = false,
    rowActions,
  }: {
    row: Row<JsonTableRow>;
    expandedCells: Set<string>;
    toggleCellExpansion: (cellId: string) => void;
    preserveStringWhitespace?: boolean;
    /** Shows an actions menu instead of the default one-click copy button. */
    rowActions?: (
      row: Row<JsonTableRow>,
    ) => ComponentProps<typeof DropdownMenu>["items"];
  }) => {
    const { value, type } = row.original;
    const cellId = `${row.id}-value`;
    const isCellExpanded = expandedCells.has(cellId);
    const handleExpandedChange = () => {
      toggleCellExpansion(cellId);
    };
    const stopPropagation = (event: React.MouseEvent) => {
      event.stopPropagation();
    };
    const [showCopySuccess, setShowCopySuccess] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const copyValue =
        typeof value === "string" ? JSON.stringify(value) : getCopyValue(value);

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

          // Render previewable media (Langfuse refs, data URIs, media URLs) as a
          // hover-to-peek chip instead of the raw string.
          const mediaDescriptor = classifyMediaValue(stringValue);
          if (mediaDescriptor) {
            return {
              content: <MediaReferenceTag descriptor={mediaDescriptor} />,
              needsTruncation: false,
            };
          }

          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS;
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue;

          return {
            content: (
              <span
                className={`text-json-value-string ${
                  preserveStringWhitespace
                    ? "whitespace-pre-wrap"
                    : "whitespace-pre-line"
                }`}
              >
                {renderStringWithLinks(displayValue)}
              </span>
            ),
            needsTruncation,
          };
        }
        case "number":
          return {
            content: (
              <span className="text-json-value-number">{String(value)}</span>
            ),
            needsTruncation: false,
          };
        case "boolean":
          return {
            content: (
              <span className="text-json-value-boolean">{String(value)}</span>
            ),
            needsTruncation: false,
          };
        case "null":
          return {
            content: (
              <span className="text-json-value-nullish italic">null</span>
            ),
            needsTruncation: false,
          };
        case "undefined":
          return {
            content: <span className="text-json-value-nullish">undefined</span>,
            needsTruncation: false,
          };
        case "array": {
          // Hide the parent preview only when expanded children are actually
          // rendered. showNullValues={false} can filter every child out while
          // leaving the expand chevron (hasChildren is computed on the raw
          // array), and blanking the cell then loses the only remaining value.
          const hasVisibleChildRows =
            row.getIsExpanded() && row.subRows.length > 0;
          if (hasVisibleChildRows) {
            return {
              content: null,
              needsTruncation: false,
            };
          }
          const arrayPreview = arrayPreviewText(value as unknown[]);
          return {
            content: renderPreview(arrayPreview),
            needsTruncation: false,
            previewTitle: arrayPreview,
          };
        }
        case "object": {
          const hasVisibleChildRows =
            row.getIsExpanded() && row.subRows.length > 0;
          if (hasVisibleChildRows) {
            return {
              content: null,
              needsTruncation: false,
            };
          }
          const objectPreview = objectPreviewText(
            value as Record<string, unknown>,
          );
          return {
            content: renderPreview(objectPreview),
            needsTruncation: false,
            previewTitle: objectPreview,
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

    const { content, needsTruncation, previewTitle } = getDisplayValue();
    const singleLine = previewTitle !== undefined;

    return (
      <div
        className={cn(
          VALUE_TEXT_CLASSES,
          "group/value-cell relative max-w-full",
          singleLine && "w-0 min-w-full",
        )}
      >
        <span
          className={cn("cursor-text", singleLine && "block truncate")}
          title={previewTitle}
        >
          {content}
        </span>
        {needsTruncation && !row.original.hasChildren && (
          // Keeps the click from reaching the row, which opens the detail view.
          <div className="flex" onClick={stopPropagation}>
            <ExpandToggle
              expanded={isCellExpanded}
              onExpandedChange={handleExpandedChange}
            />
          </div>
        )}

        {rowActions ? (
          // Portal clicks still bubble through React to the expandable table row.
          <span onClick={(event) => event.stopPropagation()}>
            <DropdownMenu
              items={rowActions(row)}
              placement="bottom-end"
              ariaLabel="Value actions"
            >
              {({ getTriggerProps }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Value actions"
                  title="Actions"
                  className={cn(
                    ROW_ACTION_BUTTON_CLASSES,
                    "-right-1.5 aria-expanded:opacity-100",
                  )}
                  {...getTriggerProps()}
                >
                  <EllipsisVertical size="base" color="default" />
                </Button>
              )}
            </DropdownMenu>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(ROW_ACTION_BUTTON_CLASSES, ROW_COPY_OFFSET)}
            onClick={handleCopy}
            title="Copy value"
            aria-label="Copy cell value"
          >
            {showCopySuccess ? (
              <Check size="base" color="default" />
            ) : (
              <Copy size="base" color="default" />
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
