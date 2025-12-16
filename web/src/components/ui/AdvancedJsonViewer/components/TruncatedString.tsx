/**
 * TruncatedString - String value with truncation and popover
 *
 * Shows truncated string with "..." and full value in a popover on hover.
 * Uses shadcn/ui HoverCard component.
 */

import { useRef, useState, useEffect } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { type JSONTheme } from "../types";
import { highlightTextWithComments } from "../utils/highlightText";

interface TruncatedStringProps {
  value: string;
  maxLength: number;
  theme: JSONTheme;
  highlightStart?: number;
  highlightEnd?: number;
  commentRanges?: Array<{ start: number; end: number }>;
}

export function TruncatedString({
  value,
  maxLength,
  theme,
  highlightStart,
  highlightEnd,
  commentRanges,
}: TruncatedStringProps) {
  const isTruncated = value.length > maxLength;
  // Still slice for performance (avoid rendering massive strings in DOM)
  // but rely on CSS ellipsis for actual visual truncation
  const displayValue = isTruncated ? value.slice(0, maxLength * 2) : value;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | undefined>(
    undefined,
  );

  // Measure trigger element width
  useEffect(() => {
    if (isTruncated && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [isTruncated]);

  // Apply highlighting to display value
  const segments = highlightTextWithComments(
    displayValue,
    highlightStart,
    highlightEnd,
    commentRanges,
  );

  if (!isTruncated) {
    // No truncation needed, just render normally
    return (
      <span
        style={{
          color: theme.stringColor,
          fontFamily: "monospace",
        }}
      >
        &quot;
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
        &quot;
      </span>
    );
  }

  // Truncated - show popover on hover, use CSS ellipsis for visual truncation
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          ref={triggerRef}
          style={{
            color: theme.stringColor,
            fontFamily: "monospace",
            cursor: "help",
            display: "inline-block",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            verticalAlign: "bottom",
          }}
        >
          <span>&quot;</span>
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
          <span>&quot;</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="p-0"
        style={{
          width: triggerWidth ? `${triggerWidth}px` : undefined,
          minWidth: triggerWidth ? `${triggerWidth}px` : undefined,
          maxWidth: triggerWidth ? `${triggerWidth}px` : "28rem",
        }}
      >
        <div
          className="max-h-60 overflow-auto p-0.5"
          style={{
            fontFamily: "monospace",
            fontSize: theme.fontSize,
            color: theme.stringColor,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
