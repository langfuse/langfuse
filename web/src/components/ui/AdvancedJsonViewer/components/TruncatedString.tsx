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
import { highlightText } from "../utils/searchJson";

interface TruncatedStringProps {
  value: string;
  maxLength: number;
  theme: JSONTheme;
  highlightStart?: number;
  highlightEnd?: number;
}

export function TruncatedString({
  value,
  maxLength,
  theme,
  highlightStart,
  highlightEnd,
}: TruncatedStringProps) {
  const isTruncated = value.length > maxLength;
  const displayValue = isTruncated ? value.slice(0, maxLength) + "..." : value;
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
  const segments = highlightText(displayValue, highlightStart, highlightEnd);

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

  // Truncated - show popover on hover
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          ref={triggerRef}
          style={{
            color: theme.stringColor,
            fontFamily: "monospace",
            cursor: "help",
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
          className="max-h-60 overflow-auto p-0.5 text-xs"
          style={{
            fontFamily: "monospace",
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
