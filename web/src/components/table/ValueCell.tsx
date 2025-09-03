import { memo } from "react";
import { type Row } from "@tanstack/react-table";
import { urlRegex } from "@langfuse/shared";
import { type JsonTableRow } from "@/src/components/table/utils/jsonExpansionUtils";

const MAX_STRING_LENGTH_FOR_LINK_DETECTION = 1500;
const MAX_CELL_DISPLAY_CHARS = 2000;
const SMALL_ARRAY_THRESHOLD = 5;
const ARRAY_PREVIEW_ITEMS = 3;
const OBJECT_PREVIEW_KEYS = 2;
const MONO_TEXT_CLASSES = "font-mono text-xs break-words";
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
          } else {
            return `{"${keys[0]}": ...}`;
          }
        }
        if (itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return <span className={PREVIEW_TEXT_CLASSES}>[{displayItems}]</span>;
  } else {
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

export const ValueCell = memo(
  ({
    row,
    expandedCells,
    toggleCellExpansion,
  }: {
    row: Row<JsonTableRow>;
    expandedCells: Set<string>;
    toggleCellExpansion: (cellId: string) => void;
  }) => {
    const { value, type } = row.original;
    const cellId = `${row.id}-value`;
    const isCellExpanded = expandedCells.has(cellId);

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
              <span className="whitespace-pre-line text-green-600 dark:text-green-400">
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
              <span className="italic text-gray-500 dark:text-gray-400">
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
      <div className={`${MONO_TEXT_CLASSES} max-w-full`}>
        {content}
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
      </div>
    );
  },
);

ValueCell.displayName = "ValueCell";

// Export utilities that might be needed elsewhere
export { getValueStringLength };
