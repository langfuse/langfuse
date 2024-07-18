import { Button } from "@/src/components/ui/button";
import { CommandShortcut } from "@/src/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect } from "react";

export const DetailPageNav = (props: {
  currentId: string;
  path: (id: string) => string;
  listKey: string;
}) => {
  const { detailPagelists } = useDetailPageLists();
  const ids = detailPagelists[props.listKey] ?? [];

  const capture = usePostHogClientCapture();
  const router = useRouter();
  const currentIndex = ids.findIndex((id) => id === props.currentId);
  const previousPageId = currentIndex > 0 ? ids[currentIndex - 1] : undefined;
  const nextPageId =
    currentIndex < ids.length - 1 ? ids[currentIndex + 1] : undefined;

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

      if (event.key === "k" && previousPageId) {
        void router.push(props.path(encodeURIComponent(previousPageId)));
      } else if (event.key === "j" && nextPageId) {
        void router.push(props.path(encodeURIComponent(nextPageId)));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previousPageId, nextPageId, router, props]);

  if (ids.length > 1)
    return (
      <div className="flex flex-row gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={!previousPageId}
              onClick={() => {
                if (previousPageId) {
                  capture("navigate_detail_pages:button_click_prev_or_next");
                  void router.push(
                    props.path(encodeURIComponent(previousPageId)),
                  );
                }
              }}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate up</span>
            <CommandShortcut className="ml-2 rounded-sm bg-muted p-1 px-2">
              k
            </CommandShortcut>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={!nextPageId}
              onClick={() => {
                if (nextPageId) {
                  capture("navigate_detail_pages:button_click_prev_or_next");
                  void router.push(props.path(encodeURIComponent(nextPageId)));
                }
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Navigate down</span>
            <CommandShortcut className="ml-2 rounded-sm bg-muted p-1 px-2">
              j
            </CommandShortcut>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  else return null;
};
