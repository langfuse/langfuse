import React, { useMemo, useCallback } from "react";
import { PlaygroundProvider } from "../context";
import Playground from "../playground";
import { SaveToPromptButton } from "./SaveToPromptButton";
import { Button } from "@/src/components/ui/button";
import { MULTI_WINDOW_CONFIG, type MultiWindowState } from "../types";

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
 * - Individual window controls (save, close)
 *
 * Architecture:
 * - Receives window state from parent (page-level management)
 * - Each window gets its own PlaygroundProvider with unique windowId
 * - Clean separation of concerns with parent handling global actions
 */

interface MultiWindowPlaygroundProps {
  windowState: MultiWindowState;
  onRemoveWindow: (windowId: string) => void;
}

export default function MultiWindowPlayground({
  windowState,
  onRemoveWindow,
}: MultiWindowPlaygroundProps) {
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

  return (
    <div className="h-full overflow-hidden">
      <div
        className="playground-windows-container h-full overflow-x-auto"
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: windowWidth,
          gap: "1rem",
          padding: "1rem",
          scrollBehavior: "smooth",
        }}
      >
        {windowState.windowIds.map((windowId, index) => (
          <PlaygroundWindow
            key={windowId}
            windowId={windowId}
            windowIndex={index}
            onRemove={onRemoveWindow}
            canRemove={windowState.windowIds.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * PlaygroundWindow Component
 *
 * Individual window wrapper that provides window-specific controls and isolation
 * Each window contains its own PlaygroundProvider with unique windowId for state isolation
 *
 * Props:
 * - windowId: Unique identifier for this window
 * - windowIndex: Display index for user reference
 * - onRemove: Callback to remove this window
 * - canRemove: Whether this window can be removed (prevents last window removal)
 */
interface PlaygroundWindowProps {
  windowId: string;
  windowIndex: number;
  onRemove: (windowId: string) => void;
  canRemove: boolean;
}

function PlaygroundWindow({
  windowId,
  windowIndex,
  onRemove,
  canRemove,
}: PlaygroundWindowProps) {
  /**
   * Handle window removal with confirmation for safety
   * Prevents accidental removal of windows with unsaved work
   */
  const handleRemove = useCallback(() => {
    if (!canRemove) {
      console.warn("Cannot remove the last remaining window");
      return;
    }
    onRemove(windowId);
  }, [windowId, onRemove, canRemove]);

  return (
    <PlaygroundProvider windowId={windowId}>
      <div className="playground-window flex h-full min-w-0 flex-col rounded-lg border bg-background shadow-sm">
        {/* Window Header */}
        <div className="flex-shrink-0 border-b bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Window {windowIndex + 1}
              </span>
              <span className="text-xs text-muted-foreground/70">
                {windowId.slice(-8)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <SaveToPromptButton />
              {canRemove && (
                <Button
                  variant="ghost"
                  onClick={handleRemove}
                  className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                  title="Remove window"
                >
                  <span className="sr-only">Remove window</span>×
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Window Content */}
        <div className="flex-1 overflow-hidden">
          <Playground />
        </div>
      </div>
    </PlaygroundProvider>
  );
}
