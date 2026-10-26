import { useState } from "react";
import { ChevronRight } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";

export function RedactedThinkingBlock({
  data,
  defaultExpanded = false,
}: {
  data: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

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
        <span className="text-xs font-bold">Thinking (redacted)</span>
        {!expanded && (
          <span className="text-xs italic">[Encrypted thinking data]</span>
        )}
      </button>

      {expanded && (
        <div className="ph-no-capture bg-muted/50 text-muted-foreground mt-1 ml-4 rounded p-2 font-mono text-xs break-all">
          {data}
        </div>
      )}
    </div>
  );
}
