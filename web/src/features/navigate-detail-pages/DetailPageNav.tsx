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
import { useEffect } from "react";

export const DetailPageNav = (props: {
  currentId: string;
  path: (entry: ListEntry) => string;
  listKey: string;
}) => {
  const { detailPagelists } = useDetailPageLists();
  const entries = detailPagelists[props.listKey] ?? [];

  const capture = usePostHogClientCapture();
  const router = useRouter();
  const currentIndex = entries.findIndex(
    (entry) => entry.id === props.currentId,
  );
  const previousPageEntry =
    currentIndex > 0 ? entries[currentIndex - 1] : undefined;
  const nextPageEntry =
    currentIndex < entries.length - 1 ? entries[currentIndex + 1] : undefined;

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
        const newPath = props.path({
          id: encodeURIComponent(previousPageEntry.id),
          params: previousPageEntry.params,
        });
        void router.push(newPath);
      } else if (event.key === "j" && nextPageEntry) {
        const newPath = props.path({
          id: encodeURIComponent(nextPageEntry.id),
          params: nextPageEntry.params,
        });
        void router.push(newPath);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previousPageEntry, nextPageEntry, router, props]);

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
                  void router.push(
                    props.path({
                      id: encodeURIComponent(previousPageEntry.id),
                      params: previousPageEntry.params,
                    }),
                  );
                }
              }}
            >
              <ChevronUp className="h-4 w-4" />
              <span className="ml-1 h-4 w-4 rounded-sm bg-primary/80 text-xs text-primary-foreground shadow-sm">
                K
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate up</span>
            <InputCommandShortcut className="ml-2 rounded-sm bg-muted p-1 px-2">
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
                  void router.push(
                    props.path({
                      id: encodeURIComponent(nextPageEntry.id),
                      params: nextPageEntry.params,
                    }),
                  );
                }
              }}
            >
              <ChevronDown className="h-4 w-4" />
              <span className="ml-1 h-4 w-4 rounded-sm bg-primary/80 text-xs text-primary-foreground shadow-sm">
                J
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate down</span>
            <InputCommandShortcut className="ml-2 rounded-sm bg-muted p-1 px-2">
              j
            </InputCommandShortcut>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  else return null;
};
