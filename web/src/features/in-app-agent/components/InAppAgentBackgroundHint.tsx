import { BotMessageSquare, Minus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import { cn } from "@/src/utils/tailwind";

/**
 * Transient nudge above the composer: the run the user just started keeps going
 * without the drawer, and they will be told when it wants them back.
 *
 * Deliberately in-window rather than a toast — it is about this drawer, and the
 * toast layer is already owned by the activity cards it is promising.
 */
export function InAppAgentBackgroundHint({
  isExpanded,
  onMinimize,
}: {
  isExpanded: boolean;
  onMinimize: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "border-border bg-muted/60 text-muted-foreground animate-in fade-in slide-in-from-bottom-1 mb-1.5 flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
        isExpanded && "mx-auto max-w-3xl",
      )}
    >
      <BotMessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        I keep running in the background — feel free to minimize, I&apos;ll
        notify you when I&apos;m done or need you.
      </p>
      {/* Mirrors the header's minimize control, so the hint teaches the
          affordance the user reaches for next time. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Minimize assistant"
        className="h-6 shrink-0 gap-1 px-1.5 text-xs"
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
    </div>
  );
}
