import { useState } from "react";
import { ChevronRight } from "lucide-react";
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
    <div className="my-2 px-1">
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-1 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn(
            "mt-0.5 h-3 w-3 flex-shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="text-xs font-medium">Thinking</span>
        {!expanded && (
          <span className="line-clamp-1 text-xs italic">{displayContent}</span>
        )}
      </button>

      {expanded && (
        <div className="ml-4 mt-1 whitespace-pre-wrap text-sm italic text-muted-foreground">
          {content}
        </div>
      )}
    </div>
  );
}

interface RedactedThinkingBlockProps {
  data: string;
  defaultExpanded?: boolean;
}

// redactedThinkingBlock renders redacted thinking content if flagged by Anthropic
export function RedactedThinkingBlock({
  data,
  defaultExpanded = false,
}: RedactedThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="my-2 px-1">
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-1 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn(
            "mt-0.5 h-3 w-3 flex-shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="text-xs font-medium">Thinking (redacted)</span>
        {!expanded && (
          <span className="text-xs italic">[Encrypted thinking data]</span>
        )}
      </button>

      {expanded && (
        <div className="ml-4 mt-1 break-all rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
          {data}
        </div>
      )}
    </div>
  );
}
