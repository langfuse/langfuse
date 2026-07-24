import { useCallback, useEffect } from "react";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
  type InAppAgentEntryPoint,
} from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { cn } from "@/src/utils/tailwind";

/** Launcher only — the assistant window itself is rendered by
 * InAppAgentWindowHost from the persistent authenticated layout, so it
 * survives the per-page remount of this button on navigation.
 *
 * `prominent` is the compact, icon-only launcher for the mobile top bar: a
 * gradient border in the agent's own palette (the colors of its window's
 * conic-gradient) so the entry point stands out, instead of the easily-missed
 * ghost icon it became when buried in the wrapping page controls row. */
export const InAppAiAgentButton = ({
  prominent = false,
}: {
  prominent?: boolean;
} = {}) => {
  const { open, setOpen, openAssistant } = useInAppAiAgent();
  const canUseAssistant = useCanUseInAppAgent();

  const toggleAssistant = useCallback(
    (source: InAppAgentEntryPoint) => {
      if (open) {
        setOpen(false);
        return;
      }

      openAssistant(source);
    },
    [open, openAssistant, setOpen],
  );

  useEffect(() => {
    if (!canUseAssistant) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.key?.toLowerCase() !== "i" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      toggleAssistant("keyboard_shortcut");
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canUseAssistant, toggleAssistant]);

  if (!canUseAssistant) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      aria-label={open ? "Close assistant" : "Open assistant"}
      aria-pressed={open}
      data-ignore-outside-interaction
      onClick={() => toggleAssistant("top_nav")}
      // Gradient border in the agent palette (its window's conic-gradient
      // colors). Inline style rather than Tailwind arbitrary values: a
      // two-layer background with per-layer clip is fiddly to quote, and this
      // also overrides the outline variant's own border/bg cleanly.
      style={
        prominent
          ? {
              border: "1.5px solid transparent",
              background:
                "linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box, linear-gradient(130deg, var(--color-2), var(--color-3)) border-box",
            }
          : undefined
      }
      className={cn(
        "gap-2",
        // Compact icon-only launcher for the top bar.
        prominent && "size-9 shrink-0 px-0",
        !prominent &&
          open &&
          "border-primary-accent bg-primary-accent/10 hover:bg-primary-accent/15",
      )}
    >
      <BotMessageSquare
        className={cn("h-4 w-4", prominent && open && "text-primary-accent")}
      />
      {/* The prominent launcher is a fixed 36px square (top bar, below md), so
          it stays strictly icon-only — the `sm:inline` label would otherwise
          reveal in the 640–767px band and overflow the box. */}
      {!prominent && (
        <>
          <span className="hidden sm:inline">Assistant</span>
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
        </>
      )}
    </Button>
  );
};
