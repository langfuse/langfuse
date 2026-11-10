import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { ChevronDown } from "@langfuse/icons";
import { HighlightedText } from "@/src/components/HighlightedText/HighlightedText";

export function SessionSidebarTraceCard({
  title,
  isActive,
  children,
  number,
  onSelect,
  highlightQuery,
  collapse,
}: {
  title: string;
  isActive: boolean;
  children: ReactNode;
  number: string | number;
  onSelect: () => void;
  highlightQuery?: string;
  collapse?: {
    isCollapsed: boolean;
    onToggle: () => void;
    label: string;
  };
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className={cn(
        "ph-no-capture group border-border hover:bg-muted/60 rounded-md border p-2 transition-colors duration-150",
        isActive && "border-primary-accent/50 bg-background dark:bg-muted",
      )}
    >
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={isActive ? "true" : undefined}
        >
          <span className="border-border bg-tertiary text-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm border px-0.5 font-mono text-[10px]">
            {number}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-bold"
            title={title}
          >
            <HighlightedText text={title} query={highlightQuery ?? ""}>
              {(parts) =>
                parts.map(({ text, isMatch }, index) =>
                  isMatch ? (
                    <mark
                      key={index}
                      className="bg-find-match-background text-foreground"
                    >
                      {text}
                    </mark>
                  ) : (
                    text
                  ),
                )
              }
            </HighlightedText>
          </span>
        </button>
        {collapse && (
          <button
            type="button"
            aria-label={collapse.label}
            aria-expanded={!collapse.isCollapsed}
            onClick={collapse.onToggle}
            className="text-muted-foreground -my-2 -mr-2.5 -ml-2 flex h-8 w-8 shrink-0 items-center justify-center"
          >
            <ChevronDown
              size="sm"
              __rawClassName={cn(
                "transition-transform duration-150",
                collapse.isCollapsed ? "-rotate-90" : "rotate-0",
              )}
            />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
