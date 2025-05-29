import { useCallback } from "react";
import { useUrlParams } from "./useUrlParams";

export const useTracePeekState = (pathname: string) => {
  const { getCurrentParams, updateParams, clearParams } =
    useUrlParams(pathname);

  // Get current params for the return value
  const currentParams = getCurrentParams();

  const setPeekView = useCallback(
    (open: boolean, id?: string, time?: string) => {
      // Read current URL parameters directly in the callback
      const { peek: currentPeek, timestamp: currentTimestamp } =
        getCurrentParams();

      if (!open || !id) {
        // Close peek view - clear all related parameters
        clearParams(["peek", "timestamp", "observation", "display"]);
      } else if (open && id !== currentPeek) {
        // Open or update peek view
        const updates: Record<string, string | undefined> = {
          peek: id,
          observation: undefined, // Clear observation when changing peek
        };

        // Set timestamp if provided, otherwise keep existing
        if (time) {
          updates.timestamp = time;
        } else if (currentTimestamp) {
          updates.timestamp = currentTimestamp;
        }

        updateParams(updates);
      }
      // If same ID is already open, do nothing
    },
    [getCurrentParams, updateParams, clearParams], // All stable functions
  );

  return {
    peekId: currentParams.peek,
    timestamp: currentParams.timestamp
      ? new Date(currentParams.timestamp)
      : undefined,
    setPeekView,
  };
};
