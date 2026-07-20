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
 * survives the per-page remount of this button on navigation. */
export const InAppAiAgentButton = () => {
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
        event.key.toLowerCase() !== "i" ||
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
      className={cn(
        "gap-2",
        open &&
          "border-primary-accent bg-primary-accent/10 hover:bg-primary-accent/15",
      )}
    >
      <BotMessageSquare className="h-4 w-4" />
      <span className="hidden sm:inline">Assistant</span>
      <KeyboardShortcut
        className="hidden bg-transparent shadow-none md:inline-flex"
        keys={[
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "⌘"
            : "Ctrl",
          "I",
        ]}
      />
    </Button>
  );
};
