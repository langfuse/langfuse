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
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { cn } from "@/src/utils/tailwind";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
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
  /**
   * Labeled ghost links per the session-detail redesign:
   * `⌃ Prev` / `Next ⌄`, tertiary grey, darkening on hover.
   */
  ghostLabeled?: boolean;
  /**
   * Disable the global j/k listener (and hide the K/J hints). The Modern
   * Session page claims j/k for stepping TURNS inside the workspace, so
   * session paging there is button-only — the two must not fight over the
   * same keys.
   */
  keyboardShortcuts?: boolean;
}) => {
  const {
    currentId,
    path,
    listKey,
    onNavigate,
    size,
    compact,
    ghostLabeled,
    keyboardShortcuts = true,
  } = props;
  const { detailPagelists } = useDetailPageLists();
  const entries = detailPagelists[listKey] ?? [];
  const [shortcutPulse, setShortcutPulse] = useState<ShortcutPulse>(null);
  const shortcutPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const capture = usePostHogClientCapture();
  const { isBetaEnabled: isV4 } = useV4Beta();
  const router = useRouter();
  const currentIndex = entries.findIndex((entry) => entry.id === currentId);
  const previousPageEntry =
    currentIndex > 0 ? entries[currentIndex - 1] : undefined;
  const nextPageEntry =
    currentIndex < entries.length - 1 ? entries[currentIndex + 1] : undefined;

  const navigateToEntry = useCallback(
    (
      entry: ListEntry,
      direction: "previous" | "next",
      method: "button" | "keyboard",
    ) => {
      // Single seam for both triggers so K/J navigation counts too (it
      // used to be button-only). `listKey` is a static list identifier and
      // `isPeek` distinguishes peek-header nav from full detail pages.
      capture("navigate_detail_pages:button_click_prev_or_next", {
        direction,
        method,
        listKey,
        isPeek: router.query.peek !== undefined,
        isV4,
      });

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
    [onNavigate, path, router, capture, listKey, isV4],
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
    if (!keyboardShortcuts) return;
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
        navigateToEntry(previousPageEntry, "previous", "keyboard");
      } else if (event.key === "j" && nextPageEntry) {
        pulseShortcut("next");
        navigateToEntry(nextPageEntry, "next", "keyboard");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    keyboardShortcuts,
    previousPageEntry,
    nextPageEntry,
    navigateToEntry,
    pulseShortcut,
  ]);

  if (entries.length > 1 && ghostLabeled) {
    const linkClassName = (active: boolean) =>
      cn(
        "text-muted-foreground hover:text-foreground gap-1.5 px-1.5",
        "transition-[color] duration-150",
        active && "text-foreground",
      );
    return (
      <div className="flex flex-row items-center gap-1">
        <Button
          variant="ghost"
          type="button"
          size="sm"
          className={linkClassName(shortcutPulse === "previous")}
          disabled={!previousPageEntry}
          onClick={() => {
            if (previousPageEntry) {
              navigateToEntry(previousPageEntry, "previous", "button");
            }
          }}
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Prev
          {keyboardShortcuts && <KeyboardShortcut>K</KeyboardShortcut>}
        </Button>
        <Button
          variant="ghost"
          type="button"
          size="sm"
          className={linkClassName(shortcutPulse === "next")}
          disabled={!nextPageEntry}
          onClick={() => {
            if (nextPageEntry) {
              navigateToEntry(nextPageEntry, "next", "button");
            }
          }}
        >
          Next
          {keyboardShortcuts && <KeyboardShortcut>J</KeyboardShortcut>}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

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
                  navigateToEntry(previousPageEntry, "previous", "button");
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
                  navigateToEntry(nextPageEntry, "next", "button");
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
