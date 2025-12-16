/**
 * JsonKey - Renders a JSON property key or array index
 *
 * Displays the key name with appropriate styling and optional search highlighting.
 */

import { type JsonKeyProps } from "../types";
import { isArrayIndex } from "../utils/jsonTypes";
import { highlightText } from "../utils/searchJson";

export function JsonKey({
  keyName,
  theme,
  isArrayIndex: isArrayIndexProp,
  highlightStart,
  highlightEnd,
  className,
}: JsonKeyProps) {
  const isIndex = isArrayIndexProp ?? isArrayIndex(keyName);
  const keyString = String(keyName);

  // Apply search highlighting if present
  const segments = highlightText(keyString, highlightStart, highlightEnd);

  return (
    <span
      className={className}
      style={{
        color: isIndex ? theme.punctuationColor : theme.keyColor,
        opacity: isIndex ? 0.5 : 1,
        fontFamily: "monospace",
        flexShrink: 0, // Prevent key from being compressed
        whiteSpace: "nowrap", // Keep key on single line
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
