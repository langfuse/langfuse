import { BotMessageSquare, Minus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import { cn } from "@/src/utils/tailwind";

/**
 * Transient nudge that the run keeps going without the drawer. Lives in the
 * notice band, so showing it never shifts the composer or the run indicator.
 */
export function InAppAgentBackgroundHint({
  isExpanded,
  onMinimize,
}: {
  isExpanded: boolean;
  onMinimize: () => void;
}) {
  return (
    <div className="shrink-0 px-2 pb-2">
      <div className={cn(isExpanded && "mx-auto max-w-3xl")}>
        <p
          role="status"
          className={cn(
            "border-border bg-muted/60 text-foreground animate-in fade-in flex w-full items-center gap-2 rounded-lg border px-2 py-1",
            isExpanded ? "text-sm" : "text-xs",
          )}
        >
          <BotMessageSquare aria-hidden="true" className="size-3 shrink-0" />
          <span className="min-w-0 flex-1">
            I keep running in the background. Feel free to minimize, I&apos;ll
            notify you when I&apos;m done or need you.
          </span>
          {/* Mirrors the header control, so the hint teaches the affordance. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Minimize assistant"
            className="-my-0.5 h-5 shrink-0 gap-1 px-1"
            onClick={onMinimize}
          >
            <Minus className="size-3" />
            <KeyboardShortcut
              className="bg-transparent shadow-none"
              keys={[
                typeof navigator !== "undefined" &&
                navigator.userAgent.includes("Mac")
                  ? "⌘"
                  : "Ctrl",
                "I",
              ]}
            />
          </Button>
        </p>
      </div>
    </div>
  );
}
