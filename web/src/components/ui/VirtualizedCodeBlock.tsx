import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { cn } from "@/src/utils/tailwind";

interface VirtualizedCodeBlockProps {
  content: string;
  language?: string;
  maxHeight?: string;
}

/**
 * Virtualized code block for displaying large JSON/code content
 * Only renders visible lines for optimal performance with large data
 * Uses @tanstack/react-virtual for efficient rendering
 */
export function VirtualizedCodeBlock({
  content,
  language: _language = "json",
  maxHeight = "600px",
}: VirtualizedCodeBlockProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Split content into lines for virtualization
  const lines = useMemo(() => content.split("\n"), [content]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24, // estimated line height in pixels
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  console.log(
    `[VirtualizedCodeBlock] Rendering ${lines.length} lines (virtualized)`,
  );

  return (
    <div
      ref={parentRef}
      className="overflow-auto rounded-b border-t bg-muted/30"
      style={{ height: maxHeight }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const line = lines[virtualRow.index];
          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={cn(
                  "px-4 py-0.5 font-mono text-xs hover:bg-muted/50",
                  "whitespace-pre-wrap break-all",
                )}
              >
                <span className="mr-4 inline-block w-12 select-none text-right text-muted-foreground">
                  {virtualRow.index + 1}
                </span>
                <span className="text-foreground">{line}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
