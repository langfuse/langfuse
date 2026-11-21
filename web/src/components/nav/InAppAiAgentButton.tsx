import { useCallback, useEffect } from "react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  useInAppAiAgent,
  type InAppAgentEntryPoint,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";

import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";
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
  const { open, setOpen, openAssistant, attentionCount } = useInAppAiAgent();

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
  }, [toggleAssistant]);

  const attentionSuffix =
    attentionCount > 0
      ? ` (${attentionCount} ${attentionCount === 1 ? "needs" : "need"} attention)`
      : "";

  return (
    <Button
      type="button"
      variant="outline"
      // Count lives on the button name — a nested badge aria-label is ignored
      // once the parent already has aria-label.
      aria-label={`${open ? "Close" : "Open"} Halo${attentionSuffix}`}
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
      <span className="relative inline-flex">
        <HaloIcon variant={prominent && open ? "launcherActive" : "launcher"} />
        {/* Conversations still owed a look: a dot on the icon, so it stays
            inside the button. Visual only, the count is in the button name. */}
        {attentionCount > 0 && (
          <span
            aria-hidden="true"
            className="bg-primary-accent absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
          />
        )}
      </span>
      {/* The prominent launcher is a fixed 36px square (top bar, below md), so
          it stays strictly icon-only — the `sm:inline` label would otherwise
          reveal in the 640–767px band and overflow the box. */}
      {!prominent && (
        <>
          <span className="hidden sm:inline">Halo</span>
          <span className="hidden md:inline-flex">
            <KeyboardShortcut variant="subtle" keys={["Mod", "I"]} />
          </span>
        </>
      )}
    </Button>
  );
};
