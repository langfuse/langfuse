import { useState, memo } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { VirtualizedCodeBlock } from "@/src/components/ui/VirtualizedCodeBlock";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";

interface JSONSectionProps {
  title: string;
  content: string;
  size: number;
  defaultExpanded?: boolean;
}

const SIZE_THRESHOLD = 100_000; // 100KB - use virtualization above this

/**
 * Smart JSON section that chooses rendering strategy based on size
 * Small data: Normal code block with syntax highlighting
 * Large data: Virtualized plain text for performance
 */
export const JSONSection = memo(function JSONSection({
  title,
  content,
  size,
  defaultExpanded = true,
}: JSONSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyTextToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sizeKB = (size / 1024).toFixed(1);
  const shouldVirtualize = size > SIZE_THRESHOLD;

  console.log(
    `[JSONSection:${title}] Size: ${sizeKB}KB, Virtualize: ${shouldVirtualize}, Expanded: ${isExpanded}`,
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between",
          "border-b bg-muted/50 px-4 py-2",
          "cursor-pointer hover:bg-muted/70",
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">({sizeKB} KB)</span>
          {shouldVirtualize && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Large data - virtualized
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            void handleCopy();
          }}
          className="h-7"
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="overflow-hidden">
          {shouldVirtualize ? (
            <VirtualizedCodeBlock content={content} language="json" />
          ) : (
            <CodeView code={content} className="text-xs" />
          )}
        </div>
      )}
    </div>
  );
});
