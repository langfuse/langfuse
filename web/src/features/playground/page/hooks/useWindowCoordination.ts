import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PlaygroundHandle,
  type WindowCoordinationReturn,
  PLAYGROUND_EVENTS,
} from "../types";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

/**
 * Playground window registry for coordinating actions across multiple playground windows
 * This Map stores references to all active playground windows and their handles
 * Key: windowId, Value: PlaygroundHandle interface
 */
const playgroundWindowRegistry = new Map<string, PlaygroundHandle>();

/**
 * Playground event bus for coordinating actions across playground windows
 * Uses the native EventTarget API for performance and simplicity
 */
const playgroundEventBus = new EventTarget();

/**
 * Hook for managing global coordination between multiple playground windows
 * Provides functions to register/unregister windows and execute global actions
 *
 * Key features:
 * - Window registration/unregistration
 * - Parallel execution of all windows
 * - Global stop functionality
 * - Execution status tracking
 * - Event-based coordination (no React re-renders)
 *
 * @returns WindowCoordinationReturn interface with coordination functions
 */
export const useWindowCoordination = (): WindowCoordinationReturn => {
  const [isExecutingAll, setIsExecutingAll] = useState(false);
  const [hasAnyModelConfigured, setHasAnyModelConfigured] = useState(false);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Check if any registered window has a model configured
   * Updates the hasAnyModelConfigured state
   */
  const checkModelConfiguration = useCallback(() => {
    const registeredWindows = Array.from(playgroundWindowRegistry.values());
    const hasModel = registeredWindows.some((handle) =>
      handle.hasModelConfigured(),
    );
    setHasAnyModelConfigured(hasModel);
  }, []);

  /**
   * Register a playground window with the global coordination system
   * Adds the window to the registry and dispatches a registration event
   *
   * @param windowId - Unique identifier for the window
   * @param handle - PlaygroundHandle interface for the window
   */
  const registerWindow = useCallback(
    (windowId: string, handle: PlaygroundHandle) => {
      playgroundWindowRegistry.set(windowId, handle);

      // Check model configuration after registration
      checkModelConfiguration();

      // Dispatch registration event for potential listeners
      playgroundEventBus.dispatchEvent(
        new CustomEvent(PLAYGROUND_EVENTS.WINDOW_REGISTERED, {
          detail: { windowId },
        }),
      );
    },
    [checkModelConfiguration],
  );

  /**
   * Unregister a playground window from the global coordination system
   * Removes the window from the registry and dispatches an unregistration event
   *
   * @param windowId - Unique identifier for the window to remove
   */
  const unregisterWindow = useCallback(
    (windowId: string) => {
      const wasRegistered = playgroundWindowRegistry.has(windowId);
      playgroundWindowRegistry.delete(windowId);

      if (wasRegistered) {
        // Check model configuration after unregistration
        checkModelConfiguration();

        // Dispatch unregistration event for potential listeners
        playgroundEventBus.dispatchEvent(
          new CustomEvent(PLAYGROUND_EVENTS.WINDOW_UNREGISTERED, {
            detail: { windowId },
          }),
        );
      }
    },
    [checkModelConfiguration],
  );

  /**
   * Execute all registered playground windows in parallel
   * Dispatches execute-all event to all windows and manages global execution state
   */
  const executeAllWindows = useCallback(() => {
    const registeredWindows = Array.from(playgroundWindowRegistry.values());

    if (registeredWindows.length === 0) {
      return;
    }

    // Check if any windows are already executing
    const alreadyExecuting = registeredWindows.some((handle) =>
      handle.getIsStreaming(),
    );
    if (alreadyExecuting) {
      return;
    }

    // Check if any window has a model configured
    const hasModel = registeredWindows.some((handle) =>
      handle.hasModelConfigured(),
    );
    if (!hasModel) {
      // Don't show error toast - the UI already shows a clear alert banner
      return;
    }

    // Dispatch execute-all event first
    playgroundEventBus.dispatchEvent(
      new CustomEvent(PLAYGROUND_EVENTS.EXECUTE_ALL),
    );

    // Check after a short delay if any windows started executing
    setTimeout(() => {
      const anyExecuting = Array.from(playgroundWindowRegistry.values()).some(
        (handle) => handle.getIsStreaming(),
      );

      if (!anyExecuting) {
        // No windows are executing - they must all be empty
        showErrorToast(
          "No content to execute",
          "Please add at least one message with content to any window.",
        );
        setIsExecutingAll(false);
      } else {
        // At least one window is executing, set global state
        setIsExecutingAll(true);

        // Clear any existing timeout
        if (executionTimeoutRef.current) {
          clearTimeout(executionTimeoutRef.current);
        }

        // Set a timeout to reset the execution state
        // This provides a fallback in case some windows don't respond
        executionTimeoutRef.current = setTimeout(() => {
          setIsExecutingAll(false);
        }, 30000); // 30 second timeout

        // Monitor execution completion
        const checkExecutionCompletion = () => {
          const stillExecuting = Array.from(
            playgroundWindowRegistry.values(),
          ).some((handle) => handle.getIsStreaming());

          if (!stillExecuting) {
            setIsExecutingAll(false);
            if (executionTimeoutRef.current) {
              clearTimeout(executionTimeoutRef.current);
              executionTimeoutRef.current = null;
            }
          } else {
            // Check again in a short interval
            setTimeout(checkExecutionCompletion, 500);
          }
        };

        // Start monitoring after a short delay to allow windows to start
        setTimeout(checkExecutionCompletion, 1000);
      }
    }, 500); // Check after 500ms
  }, []);

  /**
   * Stop all currently executing playground windows
   * Dispatches stop-all event to all windows and resets global execution state
   */
  const stopAllWindows = useCallback(() => {
    setIsExecutingAll(false);

    // Clear any existing timeout
    if (executionTimeoutRef.current) {
      clearTimeout(executionTimeoutRef.current);
      executionTimeoutRef.current = null;
    }

    // Dispatch stop-all event
    playgroundEventBus.dispatchEvent(
      new CustomEvent(PLAYGROUND_EVENTS.STOP_ALL),
    );
  }, []);

  /**
   * Get current execution status across all registered windows
   * Provides a summary of the execution state for display purposes
   *
   * @returns String describing current execution status or null if no windows
   */
  const getExecutionStatus = useCallback((): string | null => {
    const registeredWindows = Array.from(playgroundWindowRegistry.values());

    if (registeredWindows.length === 0) {
      return null;
    }

    const executingCount = registeredWindows.filter((handle) =>
      handle.getIsStreaming(),
    ).length;
    const totalCount = registeredWindows.length;

    if (executingCount === 0) {
      return null;
    }

    if (executingCount === totalCount) {
      return `Executing all ${totalCount} windows`;
    }

    return `Executing ${executingCount} of ${totalCount} windows`;
  }, []);

  // Listen for model configuration changes
  useEffect(() => {
    const handleModelConfigChange = () => {
      checkModelConfiguration();
    };

    playgroundEventBus.addEventListener(
      PLAYGROUND_EVENTS.WINDOW_MODEL_CONFIG_CHANGE,
      handleModelConfigChange,
    );

    return () => {
      playgroundEventBus.removeEventListener(
        PLAYGROUND_EVENTS.WINDOW_MODEL_CONFIG_CHANGE,
        handleModelConfigChange,
      );
    };
  }, [checkModelConfiguration]);

  return {
    registerWindow,
    unregisterWindow,
    executeAllWindows,
    stopAllWindows,
    getExecutionStatus,
    isExecutingAll,
    hasAnyModelConfigured,
  };
};

/**
 * Utility function to get the current playground window registry
 * Useful for debugging and testing purposes
 *
 * @returns Map of windowId to PlaygroundHandle
 */
export const getPlaygroundWindowRegistry = (): Map<
  string,
  PlaygroundHandle
> => {
  return playgroundWindowRegistry;
};

/**
 * Utility function to get the playground event bus
 * Useful for advanced coordination scenarios and testing
 *
 * @returns EventTarget instance
 */
export const getPlaygroundEventBus = (): EventTarget => {
  return playgroundEventBus;
};

/**
 * Utility function to get the current window count
 * Useful for UI components that need to display window statistics
 *
 * @returns Number of currently registered windows
 */
export const getWindowCount = (): number => {
  return playgroundWindowRegistry.size;
};
