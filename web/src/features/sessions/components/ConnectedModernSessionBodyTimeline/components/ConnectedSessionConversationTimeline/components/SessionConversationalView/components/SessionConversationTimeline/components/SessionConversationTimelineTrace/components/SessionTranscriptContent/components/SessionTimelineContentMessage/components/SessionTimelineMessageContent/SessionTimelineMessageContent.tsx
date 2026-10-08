import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useResizeObserver } from "@/src/hooks/useResizeObserver";
import { cn } from "@/src/utils/tailwind";

const MESSAGE_PREVIEW_HEIGHT = 384;

export function SessionTimelineMessageContent({
  children,
}: {
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [isTall, setIsTall] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const measureContent = useCallback(() => {
    setIsTall(
      (contentRef.current?.getBoundingClientRect().height ?? 0) >
        MESSAGE_PREVIEW_HEIGHT,
    );
  }, []);
  useResizeObserver(contentRef, measureContent);

  return (
    <div className="min-w-0">
      <div
        id={contentId}
        className={cn(isTall && !isExpanded && "max-h-96 overflow-hidden")}
        inert={isTall && !isExpanded ? true : undefined}
      >
        <div
          ref={contentRef}
          className={cn(
            isTall &&
              !isExpanded &&
              "[mask-image:linear-gradient(to_bottom,black_21rem,transparent_24rem)] [mask-size:100%_24rem] [mask-repeat:no-repeat]",
          )}
        >
          {children}
        </div>
      </div>
      {isTall && (
        <div className="mt-2 flex items-center gap-3">
          <div className="bg-border h-px flex-1" aria-hidden="true" />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--session-message-toggle-hover,var(--color-muted))]"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
          <div className="bg-border h-px flex-1" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
