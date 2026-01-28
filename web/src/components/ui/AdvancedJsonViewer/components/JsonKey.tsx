/**
 * JsonKey - Renders a JSON property key or array index
 *
 * Displays the key name with appropriate styling and optional search highlighting.
 */

import { type JsonKeyProps } from "../types";
import { isArrayIndex } from "../utils/jsonTypes";
import {
  highlightTextWithComments,
  COMMENT_HIGHLIGHT_COLOR,
} from "../utils/highlightText";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export function JsonKey({
  keyName,
  theme,
  isArrayIndex: isArrayIndexProp,
  highlightStart,
  highlightEnd,
  commentRanges,
  className,
}: JsonKeyProps) {
  const isIndex = isArrayIndexProp ?? isArrayIndex(keyName);
  const keyString = String(keyName);

  // Filter comment ranges to only those that overlap with the key
  // Key starts at offset 0, so we filter ranges where start < keyLength
  const keyCommentRanges = commentRanges
    ?.map((range) => ({
      start: Math.max(0, range.start),
      end: Math.min(keyString.length, range.end),
      preview: range.preview,
    }))
    .filter((range) => range.end > 0 && range.start < range.end);

  // Apply search and comment highlighting
  const segments = highlightTextWithComments(
    keyString,
    highlightStart,
    highlightEnd,
    keyCommentRanges,
  );

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
      {segments.map((segment, index) => {
        const backgroundColor =
          segment.type === "search"
            ? theme.searchMatchBackground
            : segment.type === "comment"
              ? COMMENT_HIGHLIGHT_COLOR
              : "transparent";

        const highlightedSpan = (
          <span key={index} style={{ backgroundColor }}>
            {segment.text}
          </span>
        );

        // Wrap comment highlights in tooltip if preview exists
        if (segment.type === "comment" && segment.preview) {
          return (
            <Tooltip key={index}>
              <TooltipTrigger asChild>{highlightedSpan}</TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                className="max-w-xs px-2 py-1 text-xs"
              >
                {segment.preview}
              </TooltipContent>
            </Tooltip>
          );
        }

        return highlightedSpan;
      })}
    </span>
  );
}
