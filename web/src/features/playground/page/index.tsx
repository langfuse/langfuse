import React, { useCallback, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Plus, Play, Square, Loader2 } from "lucide-react";
import { ResetPlaygroundButton } from "@/src/features/playground/page/components/ResetPlaygroundButton";
import { useWindowCoordination } from "@/src/features/playground/page/hooks/useWindowCoordination";
import { usePersistedWindowIds } from "@/src/features/playground/page/hooks/usePersistedWindowIds";
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
 * - Persistent window IDs across page refreshes
 *
 * Architecture:
 * - Page-level window state management
 * - Header integration with multi-window controls
 * - Global coordination through useWindowCoordination hook
 * - Clean single-header design
 */
export default function PlaygroundPage() {
  const { windowIds, isLoaded, addWindowId, removeWindowId } =
    usePersistedWindowIds();
  const [isExecutingAll, setIsExecutingAll] = useState(false);

  // Global coordination hook for managing window actions
  const {
    executeAllWindows,
    stopAllWindows,
    getExecutionStatus,
    isExecutingAll: globalIsExecutingAll,
  } = useWindowCoordination();

  /**
   * Add a new window to the playground
   */
  const addWindow = useCallback(() => {
    addWindowId();
  }, [addWindowId]);

  /**
   * Remove a window from the playground
   */
  const removeWindow = useCallback(
    (windowId: string) => {
      removeWindowId(windowId);
    },
    [removeWindowId],
  );

  /**
   * Handle global execution of all windows
   */
  const handleExecuteAll = useCallback(() => {
    setIsExecutingAll(true);
    executeAllWindows();

    setTimeout(() => {
      setIsExecutingAll(false);
    }, 1000);
  }, [executeAllWindows]);

  /**
   * Handle global stop of all windows
   */
  const handleStopAll = useCallback(() => {
    setIsExecutingAll(false);
    stopAllWindows();
  }, [stopAllWindows]);

  // Don't render until window IDs are loaded
  if (!isLoaded) {
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
        }}
      >
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Page>
    );
  }

  // Execution status and control states
  const executionStatus = getExecutionStatus();
  const isAddWindowDisabled =
    windowIds.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS;
  const isRunAllDisabled = globalIsExecutingAll || isExecutingAll;

  const windowState: MultiWindowState = {
    windowIds,
    isExecutingAll: globalIsExecutingAll,
  };

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
                {windowIds.length} window
                {windowIds.length === 1 ? "" : "s"}
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
              disabled={!globalIsExecutingAll}
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
