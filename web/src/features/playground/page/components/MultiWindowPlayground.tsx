import React, { useMemo, useCallback, useRef, useEffect } from "react";
import { PlaygroundProvider } from "../context";
import { SaveToPromptButton } from "./SaveToPromptButton";
import { Button } from "@/src/components/ui/button";
import { Plus, X } from "lucide-react";
import { MULTI_WINDOW_CONFIG, type MultiWindowState } from "../types";
import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "../context";
import { Messages } from "@/src/features/playground/page/components/Messages";
import { ConfigurationDropdowns } from "@/src/features/playground/page/components/ConfigurationDropdowns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useIsMobile } from "@/src/hooks/use-mobile";

/**
 * MultiWindowPlayground Component
 *
 * Container component that renders multiple playground windows for side-by-side
 * prompt comparison and testing. Receives window state and management functions
 * from the parent page component.
 *
 * Key Features:
 * - Responsive layout with horizontal scrolling
 * - Window-specific state isolation
 * - Equal-width distribution with minimum width constraints
 * - Individual window controls (save, copy, close)
 * - Window state copying for rapid iteration
 *
 * Architecture:
 * - Receives window state from parent (page-level management)
 * - Each window gets its own PlaygroundProvider with unique windowId
 * - State copying handled by parent component through hooks
 * - Clean separation of concerns with parent handling global actions
 */

interface MultiWindowPlaygroundProps {
  windowState: MultiWindowState;
  onRemoveWindow: (windowId: string) => void;
  onAddWindow: (sourceWindowId?: string) => void;
}

export default function MultiWindowPlayground({
  windowState,
  onRemoveWindow,
  onAddWindow,
}: MultiWindowPlaygroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevWindowCountRef = useRef(windowState.windowIds.length);
  const isMobile = useIsMobile();

  /**
   * Calculate responsive window width based on screen size and window count
   * Ensures minimum width while distributing available space equally
   */
  const windowWidth = useMemo(() => {
    const minWidth = MULTI_WINDOW_CONFIG.MIN_WINDOW_WIDTH;
    const windowCount = windowState.windowIds.length;

    // Calculate ideal width: 100% divided by number of windows
    const idealWidth = `${100 / windowCount}%`;

    // Use CSS minmax to ensure minimum width is respected
    return `minmax(${minWidth}px, ${idealWidth})`;
  }, [windowState.windowIds.length]);

  /**
   * Auto-scroll to the right when a new window is added (not removed)
   */
  useEffect(() => {
    const currentCount = windowState.windowIds.length;
    const prevCount = prevWindowCountRef.current;

    if (currentCount > prevCount && containerRef.current) {
      containerRef.current.scrollTo({
        left: containerRef.current.scrollWidth,
        behavior: "smooth",
      });
    }

    prevWindowCountRef.current = currentCount;
  }, [windowState.windowIds.length]);

  /**
   * Handle copying a specific window to create a new window
   * This is called when the individual window "Copy" button is clicked
   *
   * @param sourceWindowId - The window ID to copy from
   */
  const handleCopyWindow = useCallback(
    (sourceWindowId: string) => {
      onAddWindow(sourceWindowId);
    },
    [onAddWindow],
  );

  const firstWindowId = windowState.windowIds[0];
  if (!firstWindowId) return null;

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-1 overflow-x-auto md:grid"
      style={{
        gridAutoFlow: "column",
        gridAutoColumns: windowWidth,
        gap: "1rem",
        padding: "1rem",
        scrollBehavior: "smooth",
      }}
    >
      {windowState.windowIds.map((windowId, index) => {
        const isFirstWindow = index === 0;

        return (
          <div
            key={windowId}
            className={isFirstWindow ? "flex-1" : "hidden md:block"}
          >
            <PlaygroundProvider windowId={windowId}>
              <PlaygroundWindowContent
                windowId={windowId}
                onRemove={onRemoveWindow}
                onCopy={handleCopyWindow}
                canRemove={windowState.windowIds.length > 1}
                isMobile={isMobile}
              />
            </PlaygroundProvider>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inner component that has access to the PlaygroundProvider context
 */
function PlaygroundWindowContent({
  windowId,
  onRemove,
  onCopy,
  canRemove,
  isMobile,
}: {
  windowId: string;
  onRemove: (windowId: string) => void;
  onCopy: (windowId: string) => void;
  canRemove: boolean;
  isMobile?: boolean;
}) {
  const playgroundContext = usePlaygroundContext();

  const handleRemove = useCallback(() => {
    onRemove(windowId);
  }, [windowId, onRemove]);

  const handleCopy = useCallback(() => {
    onCopy(windowId);
  }, [windowId, onCopy]);

  return (
    <div className="playground-window flex h-full min-w-0 flex-col rounded-lg border bg-background shadow-sm @container">
      {/* Window Header */}
      <div className="relative flex-shrink-0 border-b bg-muted/50 px-3 py-1">
        <div className="flex items-center pr-32 @xl:pr-96">
          <div className="flex items-center gap-2">
            <ModelParameters {...playgroundContext} layout="compact" />
          </div>

          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <TooltipProvider delayDuration={300}>
              <SaveToPromptButton />

              {/* Hide copy button on mobile */}
              {!isMobile && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleCopy}
                        className="h-7 gap-1.5 px-2.5 text-xs @xl:hidden"
                      >
                        <Plus size={14} />
                        <span className="sr-only">New split window</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      New split window
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="outline"
                    onClick={handleCopy}
                    className="hidden h-7 gap-1.5 px-2.5 text-xs @xl:flex"
                  >
                    <Plus size={14} />
                    <span>New split window</span>
                  </Button>
                </>
              )}
              {canRemove && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={handleRemove}
                      className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X size={14} />
                      <span className="sr-only">Remove window</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Remove window
                  </TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Window Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <ConfigurationDropdowns />

          <div className="flex-1 overflow-auto p-4">
            <Messages {...playgroundContext} />
          </div>
        </div>
      </div>
    </div>
  );
}
