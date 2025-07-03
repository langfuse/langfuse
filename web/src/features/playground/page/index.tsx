import React, { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/src/components/ui/button";
import { Plus, Play, Square, Loader2 } from "lucide-react";
import { ResetPlaygroundButton } from "@/src/features/playground/page/components/ResetPlaygroundButton";
import { useWindowCoordination } from "@/src/features/playground/page/hooks/useWindowCoordination";
import {
  MULTI_WINDOW_CONFIG,
  type MultiWindowState,
} from "@/src/features/playground/page/types";
import Page from "@/src/components/layouts/page";
import MultiWindowPlayground from "@/src/features/playground/page/components/MultiWindowPlayground";

/**
 * PlaygroundPage Component
 *
 * Main playground page that provides the multi-window playground experience
 * for prompt testing and comparison. Manages window state at the page level
 * to enable header controls integration.
 *
 * Key Features:
 * - Multi-window playground for side-by-side comparison
 * - Integrated header controls for window management
 * - Global execution controls (Run All, Stop All)
 * - Window count display and management
 * - Reset playground functionality for starting fresh
 *
 * Architecture:
 * - Page-level window state management
 * - Header integration with multi-window controls
 * - Global coordination through useWindowCoordination hook
 * - Clean single-header design
 */
export default function PlaygroundPage() {
  // Window state management at page level
  const [windowState, setWindowState] = useState<MultiWindowState>({
    windowIds: [uuidv4()], // Start with one window
    isExecutingAll: false,
  });

  // Global coordination hook for managing window actions
  const {
    executeAllWindows,
    stopAllWindows,
    getExecutionStatus,
    isExecutingAll,
  } = useWindowCoordination();

  /**
   * Add a new window to the playground
   */
  const addWindow = useCallback(() => {
    setWindowState((prev) => {
      if (prev.windowIds.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS) {
        console.warn(
          `Maximum window limit of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} reached`,
        );
        return prev;
      }

      const newWindowId = uuidv4();
      return {
        ...prev,
        windowIds: [...prev.windowIds, newWindowId],
      };
    });
  }, []);

  /**
   * Remove a window from the playground
   */
  const removeWindow = useCallback((windowId: string) => {
    setWindowState((prev) => {
      if (prev.windowIds.length <= 1) {
        console.warn("Cannot remove the last remaining window");
        return prev;
      }

      const updatedWindowIds = prev.windowIds.filter((id) => id !== windowId);
      return {
        ...prev,
        windowIds: updatedWindowIds,
      };
    });
  }, []);

  /**
   * Handle global execution of all windows
   */
  const handleExecuteAll = useCallback(() => {
    setWindowState((prev) => ({ ...prev, isExecutingAll: true }));
    executeAllWindows();

    setTimeout(() => {
      setWindowState((prev) => ({ ...prev, isExecutingAll: false }));
    }, 1000);
  }, [executeAllWindows]);

  /**
   * Handle global stop of all windows
   */
  const handleStopAll = useCallback(() => {
    setWindowState((prev) => ({ ...prev, isExecutingAll: false }));
    stopAllWindows();
  }, [stopAllWindows]);

  // Execution status and control states
  const executionStatus = getExecutionStatus();
  const isAddWindowDisabled =
    windowState.windowIds.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS;
  const isRunAllDisabled = isExecutingAll || windowState.isExecutingAll;

  return (
    <Page
      withPadding={false}
      headerProps={{
        title: "Playground",
        help: {
          description:
            "A sandbox to test and iterate your prompts across multiple windows",
          href: "https://langfuse.com/docs/playground",
        },
        actionButtonsRight: (
          <>
            {/* Window Count Display */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {windowState.windowIds.length} window
                {windowState.windowIds.length === 1 ? "" : "s"}
              </span>
              {executionStatus && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {executionStatus}
                  </div>
                </>
              )}
            </div>

            {/* Multi-Window Controls */}
            <Button
              variant="outline"
              onClick={handleExecuteAll}
              disabled={isRunAllDisabled}
              className="gap-1"
            >
              {isRunAllDisabled ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Run All
            </Button>

            <Button
              variant="outline"
              onClick={handleStopAll}
              disabled={!isExecutingAll}
              className="gap-1"
            >
              <Square className="h-3 w-3" />
              Stop All
            </Button>

            <Button
              variant="outline"
              onClick={addWindow}
              disabled={isAddWindowDisabled}
              className="gap-1"
              title={
                isAddWindowDisabled
                  ? `Maximum of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} windows allowed`
                  : "Add new window"
              }
            >
              <Plus className="h-3 w-3" />
              Add Window
            </Button>

            <ResetPlaygroundButton />
          </>
        ),
      }}
    >
      <div className="h-full w-full">
        <MultiWindowPlayground
          windowState={windowState}
          onRemoveWindow={removeWindow}
        />
      </div>
    </Page>
  );
}
