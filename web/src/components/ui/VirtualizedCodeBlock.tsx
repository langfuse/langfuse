import { Virtuoso } from "react-virtuoso";
import { useMemo } from "react";
import { cn } from "@/src/utils/tailwind";

interface VirtualizedCodeBlockProps {
  content: string;
  language?: string;
  maxHeight?: string;
}

/**
 * Virtualized code block for displaying large JSON/code content
 * Only renders visible lines for optimal performance with large data
 */
export function VirtualizedCodeBlock({
  content,
  language = "json",
  maxHeight = "600px",
}: VirtualizedCodeBlockProps) {
  // Split content into lines for virtualization
  const lines = useMemo(() => content.split("\n"), [content]);

  console.log(
    `[VirtualizedCodeBlock] Rendering ${lines.length} lines (virtualized)`,
  );

  return (
    <div
      className="overflow-auto rounded-b border-t bg-muted/30"
      style={{ height: maxHeight }}
    >
      <Virtuoso
        data={lines}
        itemContent={(index, line) => (
          <div
            className={cn(
              "px-4 py-0.5 font-mono text-xs hover:bg-muted/50",
              "whitespace-pre-wrap break-all",
            )}
          >
            <span className="mr-4 inline-block w-12 select-none text-right text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-foreground">{line}</span>
          </div>
        )}
        className="w-full"
        overscan={10}
      />
    </div>
  );
}
