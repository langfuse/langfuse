/**
 * JsonValue - Renders a JSON value with type-based styling
 *
 * Handles all JSON types: string, number, boolean, null, objects, arrays
 * Includes truncation, search highlighting, and preview text for expandable values.
 */

import { type JsonValueProps } from "../types";
import { formatValuePreview } from "../utils/jsonTypes";
import { highlightTextWithComments } from "../utils/highlightText";
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
  commentRanges,
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
          whiteSpace: "nowrap", // Never wrap preview text like "{4 keys}" or "Array(3)"
          flexShrink: 0, // Prevent compression in flex container
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
            commentRanges={commentRanges}
          />
        );
      }
    }

    // Mode 2: "nowrap" or Mode 3: "wrap" - render with appropriate whiteSpace
    const segments = highlightTextWithComments(
      str,
      highlightStart,
      highlightEnd,
      commentRanges,
    );

    return (
      <span
        className={className}
        style={{
          color,
          fontFamily: "monospace",
          whiteSpace: stringWrapMode === "wrap" ? "pre-wrap" : "nowrap",
          overflowWrap: stringWrapMode === "wrap" ? "break-word" : undefined,
          wordBreak: stringWrapMode === "wrap" ? "break-word" : undefined,
          display: stringWrapMode === "wrap" ? "inline-block" : undefined,
          maxWidth: stringWrapMode === "wrap" ? "100%" : undefined,
        }}
      >
        &quot;
        {segments.map((segment, index) => {
          const backgroundColor =
            segment.type === "search"
              ? theme.searchMatchBackground
              : segment.type === "comment"
                ? // TODO: change highlight color!
                  "rgba(147, 112, 219, 0.25)" // Purple highlight for comments
                : "transparent";

          return (
            <span key={index} style={{ backgroundColor }}>
              {segment.text}
            </span>
          );
        })}
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

  // Apply search and comment highlighting
  const segments = highlightTextWithComments(
    displayValue,
    highlightStart,
    highlightEnd,
    commentRanges,
  );

  return (
    <span
      className={className}
      style={{
        color,
        fontFamily: "monospace",
      }}
    >
      {segments.map((segment, index) => {
        const backgroundColor =
          segment.type === "search"
            ? theme.searchMatchBackground
            : segment.type === "comment"
              ? // TODO: change color
                "rgba(147, 112, 219, 0.25)" // Purple highlight for comments
              : "transparent";

        return (
          <span key={index} style={{ backgroundColor }}>
            {segment.text}
          </span>
        );
      })}
    </span>
  );
}
