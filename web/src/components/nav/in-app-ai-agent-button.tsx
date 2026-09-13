/* eslint-disable @repo/no-null-render */
import { useCallback, useEffect } from "react";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  useIsInAppAgentLauncherVisible,
  useInAppAiAgent,
  type InAppAgentEntryPoint,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
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
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();

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
    if (!isInAppAgentLauncherVisible) {
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
  }, [isInAppAgentLauncherVisible, toggleAssistant]);

  if (!isInAppAgentLauncherVisible) {
    return null;
  }

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
      aria-label={`${open ? "Close" : "Open"} assistant${attentionSuffix}`}
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
        "relative gap-2",
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
      {/* Conversations still owed a look. Anchored to the button rather than
          the icon so it survives the prominent (icon-only) variant. Visual
          only — accessible name is on the button. */}
      {attentionCount > 0 && (
        <span
          aria-hidden="true"
          className="bg-primary-accent text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold"
        >
          {attentionCount > 99 ? "99+" : attentionCount}
        </span>
      )}
      {/* The prominent launcher is a fixed 36px square (top bar, below md), so
          it stays strictly icon-only — the `sm:inline` label would otherwise
          reveal in the 640–767px band and overflow the box. */}
      {!prominent && (
        <>
          <span className="hidden sm:inline">Assistant</span>
          <span className="hidden md:inline-flex">
            <KeyboardShortcut variant="subtle" keys={["Mod", "I"]} />
          </span>
        </>
      )}
    </Button>
  );
};
