/**
 * JsonValue - Renders a JSON value with type-based styling
 *
 * Handles all JSON types: string, number, boolean, null, objects, arrays
 * Includes truncation, search highlighting, and preview text for expandable values.
 */

import { type JsonValueProps } from "../types";
import { formatValuePreview } from "../utils/jsonTypes";
import { highlightText } from "../utils/searchJson";
import { TruncatedString } from "./TruncatedString";

export function JsonValue({
  value,
  type,
  theme,
  isExpandable = false,
  childCount: _childCount,
  stringWrapMode = "truncate",
  truncateStringsAt = null,
  highlightStart,
  highlightEnd,
  className,
}: JsonValueProps) {
  // For expandable values, show preview text
  if (isExpandable) {
    const preview = formatValuePreview(value);
    return (
      <span
        className={className}
        style={{
          color: theme.punctuationColor,
          opacity: 0.4,
          fontFamily: "monospace",
        }}
      >
        {preview}
      </span>
    );
  }

  // Get color based on type
  const getColor = () => {
    switch (type) {
      case "string":
        return theme.stringColor;
      case "number":
        return theme.numberColor;
      case "boolean":
        return theme.booleanColor;
      case "null":
      case "undefined":
        return theme.nullColor;
      default:
        return theme.foreground;
    }
  };

  const color = getColor();

  // Handle string values with wrap mode logic
  if (type === "string") {
    const str = value as string;

    // Mode 1: "truncate" - use TruncatedString component
    if (stringWrapMode === "truncate") {
      const shouldTruncate =
        truncateStringsAt !== null && str.length > truncateStringsAt;

      if (shouldTruncate) {
        return (
          <TruncatedString
            value={str}
            maxLength={truncateStringsAt}
            theme={theme}
            highlightStart={highlightStart}
            highlightEnd={highlightEnd}
          />
        );
      }
    }

    // Mode 2: "nowrap" or Mode 3: "wrap" - render with appropriate whiteSpace
    const segments = highlightText(str, highlightStart, highlightEnd);

    return (
      <span
        className={className}
        style={{
          color,
          fontFamily: "monospace",
          whiteSpace: stringWrapMode === "wrap" ? "pre-wrap" : "nowrap",
        }}
      >
        &quot;
        {segments.map((segment, index) => (
          <span
            key={index}
            style={{
              backgroundColor: segment.isHighlight
                ? theme.searchMatchBackground
                : "transparent",
            }}
          >
            {segment.text}
          </span>
        ))}
        &quot;
      </span>
    );
  }

  // Handle other primitive types
  const displayValue = (() => {
    switch (type) {
      case "null":
        return "null";
      case "undefined":
        return "undefined";
      case "boolean":
        return String(value);
      case "number":
        return String(value);
      default:
        return String(value);
    }
  })();

  // Apply search highlighting
  const segments = highlightText(displayValue, highlightStart, highlightEnd);

  return (
    <span
      className={className}
      style={{
        color,
        fontFamily: "monospace",
      }}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          style={{
            backgroundColor: segment.isHighlight
              ? theme.searchMatchBackground
              : "transparent",
          }}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}
