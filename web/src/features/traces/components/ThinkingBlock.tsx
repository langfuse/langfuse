import { useState } from "react";
import { ChevronRight } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";

interface ThinkingBlockProps {
  content: string;
  summary?: string;
  defaultExpanded?: boolean;
}

export function ThinkingBlock({
  content,
  summary,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayContent = summary || content;

  return (
    <div className="my-2">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-start gap-1 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <ChevronRight
          size="sm"
          color="tertiary"
          __rawClassName={cn(
            "mt-0.5 translate-y-px transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="text-xs font-bold">Thinking</span>
        {!expanded && (
          <span className="ph-no-capture line-clamp-1 text-xs italic">
            {displayContent}
          </span>
        )}
      </button>

      {expanded && (
        <div className="ph-no-capture text-muted-foreground mt-1 ml-4 text-sm whitespace-pre-wrap italic">
          {content}
        </div>
      )}
    </div>
  );
}
