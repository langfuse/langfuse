import { Button } from "@/src/components/ui/button";
import { InputCommandShortcut } from "@/src/components/ui/input-command";
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
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect } from "react";

export const DetailPageNav = (props: {
  currentId: string;
  path: (entry: ListEntry) => string;
  listKey: string;
  onNavigate?: (entry: ListEntry) => void;
}) => {
  const { currentId, path, listKey, onNavigate } = props;
  const { detailPagelists } = useDetailPageLists();
  const entries = detailPagelists[listKey] ?? [];

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

      void router.push(
        path({
          id: encodeURIComponent(entry.id),
          params: entry.params,
        }),
      );
    },
    [onNavigate, path, router],
  );

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
        navigateToEntry(previousPageEntry);
      } else if (event.key === "j" && nextPageEntry) {
        navigateToEntry(nextPageEntry);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previousPageEntry, nextPageEntry, navigateToEntry]);

  if (entries.length > 1)
    return (
      <div className="flex flex-row gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              type="button"
              className="p-2"
              disabled={!previousPageEntry}
              onClick={() => {
                if (previousPageEntry) {
                  capture("navigate_detail_pages:button_click_prev_or_next");
                  navigateToEntry(previousPageEntry);
                }
              }}
            >
              <ChevronUp className="h-4 w-4" />
              <span className="bg-primary/80 text-primary-foreground ml-1 h-4 w-4 rounded-sm text-xs shadow-xs">
                K
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate up</span>
            <InputCommandShortcut className="bg-muted ml-2 rounded-sm p-1 px-2">
              k
            </InputCommandShortcut>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              type="button"
              className="p-2"
              disabled={!nextPageEntry}
              onClick={() => {
                if (nextPageEntry) {
                  capture("navigate_detail_pages:button_click_prev_or_next");
                  navigateToEntry(nextPageEntry);
                }
              }}
            >
              <ChevronDown className="h-4 w-4" />
              <span className="bg-primary/80 text-primary-foreground ml-1 h-4 w-4 rounded-sm text-xs shadow-xs">
                J
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate down</span>
            <InputCommandShortcut className="bg-muted ml-2 rounded-sm p-1 px-2">
              j
            </InputCommandShortcut>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  else return null;
};
