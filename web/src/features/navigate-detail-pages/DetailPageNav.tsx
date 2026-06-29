import { Button, type ButtonProps } from "@/src/components/ui/button";
import { InputCommandShortcut } from "@/src/components/ui/input-command";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  type ListEntry,
  useDetailPageLists,
} from "@/src/features/navigate-detail-pages/context";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

const SHORTCUT_PULSE_MS = 160;

type ShortcutPulse = "previous" | "next" | null;

export const DetailPageNav = (props: {
  currentId: string;
  path: (entry: ListEntry) => string;
  listKey: string;
  onNavigate?: (entry: ListEntry) => void;
  /** Button size; defaults to the cva default. Pass "sm" to match icon-xs rows. */
  size?: ButtonProps["size"];
  /**
   * Compact mode for dense toolbars (e.g. the peek header): icon-only ghost
   * arrows with the K/J hint moved to the tooltip, so the buttons match a row
   * of icon-xs controls instead of standing out. Shortcuts still work.
   */
  compact?: boolean;
}) => {
  const { currentId, path, listKey, onNavigate, size, compact } = props;
  const { detailPagelists } = useDetailPageLists();
  const entries = detailPagelists[listKey] ?? [];
  const [shortcutPulse, setShortcutPulse] = useState<ShortcutPulse>(null);
  const shortcutPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const capture = usePostHogClientCapture();
  const router = useRouter();
  const currentIndex = entries.findIndex((entry) => entry.id === currentId);
  const previousPageEntry =
    currentIndex > 0 ? entries[currentIndex - 1] : undefined;
  const nextPageEntry =
    currentIndex < entries.length - 1 ? entries[currentIndex + 1] : undefined;

  const navigateToEntry = useCallback(
    (entry: ListEntry) => {
      if (onNavigate) {
        onNavigate(entry);
        return;
      }

      router.push(
        path({
          id: encodeURIComponent(entry.id),
          params: entry.params,
        }),
      );
    },
    [onNavigate, path, router],
  );

  const pulseShortcut = useCallback(
    (direction: Exclude<ShortcutPulse, null>) => {
      if (shortcutPulseTimeoutRef.current) {
        clearTimeout(shortcutPulseTimeoutRef.current);
      }

      setShortcutPulse(direction);
      shortcutPulseTimeoutRef.current = setTimeout(() => {
        setShortcutPulse(null);
        shortcutPulseTimeoutRef.current = null;
      }, SHORTCUT_PULSE_MS);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (shortcutPulseTimeoutRef.current) {
        clearTimeout(shortcutPulseTimeoutRef.current);
      }
    };
  }, []);

  // keyboard shortcuts for buttons k and j
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // don't trigger keyboard shortcuts if the user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.getAttribute("role") === "textbox")
      ) {
        return;
      }
      // don't trigger shortcuts if modifier keys are pressed (e.g., Cmd+K for universal search)
      if (event.metaKey || event.ctrlKey) {
        return;
      }

      if (event.key === "k" && previousPageEntry) {
        pulseShortcut("previous");
        navigateToEntry(previousPageEntry);
      } else if (event.key === "j" && nextPageEntry) {
        pulseShortcut("next");
        navigateToEntry(nextPageEntry);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previousPageEntry, nextPageEntry, navigateToEntry, pulseShortcut]);

  if (entries.length > 1) {
    const buttonClassName = (active: boolean) =>
      cn(
        "transition-[background-color,border-color,box-shadow,color] duration-150",
        !compact && "gap-1.5 px-2",
        active && "border-primary/60 bg-accent/60 ring-primary/20 ring-2",
      );
    return (
      <div className="flex flex-row gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={compact ? "ghost" : "outline"}
              type="button"
              size={compact ? "icon-xs" : size}
              className={buttonClassName(shortcutPulse === "previous")}
              disabled={!previousPageEntry}
              onClick={() => {
                if (previousPageEntry) {
                  capture("navigate_detail_pages:button_click_prev_or_next");
                  navigateToEntry(previousPageEntry);
                }
              }}
            >
              <ArrowUp className="h-4 w-4" />
              {!compact && <KeyboardShortcut>K</KeyboardShortcut>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate up</span>
            <InputCommandShortcut className="ml-2">K</InputCommandShortcut>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={compact ? "ghost" : "outline"}
              type="button"
              size={compact ? "icon-xs" : size}
              className={buttonClassName(shortcutPulse === "next")}
              disabled={!nextPageEntry}
              onClick={() => {
                if (nextPageEntry) {
                  capture("navigate_detail_pages:button_click_prev_or_next");
                  navigateToEntry(nextPageEntry);
                }
              }}
            >
              <ArrowDown className="h-4 w-4" />
              {!compact && <KeyboardShortcut>J</KeyboardShortcut>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate down</span>
            <InputCommandShortcut className="ml-2">J</InputCommandShortcut>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }
  return null;
};
