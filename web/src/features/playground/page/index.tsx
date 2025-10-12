import React, { useCallback } from "react";
import { Button } from "@/src/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { ResetPlaygroundButton } from "@/src/features/playground/page/components/ResetPlaygroundButton";
import { useWindowCoordination } from "@/src/features/playground/page/hooks/useWindowCoordination";
import { usePersistedWindowIds } from "@/src/features/playground/page/hooks/usePersistedWindowIds";
import useCommandEnter from "@/src/features/playground/page/hooks/useCommandEnter";
import { type MultiWindowState } from "@/src/features/playground/page/types";
import Page from "@/src/components/layouts/page";
import MultiWindowPlayground from "@/src/features/playground/page/components/MultiWindowPlayground";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { windowIds, isLoaded, addWindowWithCopy, removeWindowId } =
    usePersistedWindowIds();

  // Global coordination hook for managing window actions
  const {
    executeAllWindows,
    getExecutionStatus,
    isExecutingAll: globalIsExecutingAll,
  } = useWindowCoordination();

  /**
   * Add a new window to the playground
   * @param sourceWindowId - Optional source window ID to copy state from. If not provided, copies from the most recent window.
   */
  const addWindow = useCallback(
    (sourceWindowId?: string) => {
      const newWindowId = addWindowWithCopy(sourceWindowId);
      if (newWindowId) {
        console.log(`Added new window: ${newWindowId}`);
      } else {
        console.warn("Failed to add new window");
      }
    },
    [addWindowWithCopy],
  );

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
    executeAllWindows();
  }, [executeAllWindows]);

  // Handle command+enter for "Run All" button
  useCommandEnter(!globalIsExecutingAll, async () => {
    executeAllWindows();
  });

  // Don't render until window IDs are loaded
  if (!isLoaded) {
    return (
      <Page
        withPadding={false}
        headerProps={{
          title: t("playground.page.title"),
          help: {
            description: t("playground.page.description"),
            href: "https://langfuse.com/docs/prompt-management/features/playground",
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
  const executionStatus = globalIsExecutingAll
    ? getExecutionStatus() ||
      t(
        windowIds.length === 1
          ? "playground.page.executingWindows"
          : "playground.page.executingWindowsPlural",
        { count: windowIds.length },
      )
    : getExecutionStatus();
  const isRunAllDisabled = globalIsExecutingAll;

  const windowState: MultiWindowState = {
    windowIds,
    isExecutingAll: globalIsExecutingAll,
  };

  return (
    <Page
      scrollable={false}
      withPadding={false}
      headerProps={{
        title: t("playground.page.title"),
        help: {
          description: t("playground.page.description"),
          href: "https://langfuse.com/docs/prompt-management/features/playground",
        },
        actionButtonsRight: (
          <div className="flex flex-nowrap items-center gap-2">
            {/* Window Count Display - Hidden on mobile */}
            <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
              <span className="whitespace-nowrap">
                {t(
                  windowIds.length === 1
                    ? "playground.page.windowCount"
                    : "playground.page.windowCountPlural",
                  { count: windowIds.length },
                )}
              </span>
              {executionStatus && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="hidden whitespace-nowrap sm:inline">
                      {executionStatus}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Multi-Window Controls - Hidden on mobile */}
            <Button
              variant="outline"
              onClick={handleExecuteAll}
              disabled={isRunAllDisabled}
              className="hidden flex-shrink-0 gap-1 md:flex"
              title={t("playground.page.executeAll")}
            >
              {isRunAllDisabled ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              <span className="hidden lg:inline">
                {t("playground.page.runAll")}
              </span>
            </Button>

            {/* Reset Playground Button */}
            <ResetPlaygroundButton />
          </div>
        ),
      }}
    >
      <MultiWindowPlayground
        windowState={windowState}
        onRemoveWindow={removeWindow}
        onAddWindow={addWindow}
      />
    </Page>
  );
}
