/**
 * useLogViewConfirmation - Hook for managing log view confirmation dialog state
 *
 * Handles the threshold-based confirmation logic for viewing traces with many observations.
 * Consolidates related state (hasConfirmed, showDialog) and derived values (isDisabled, requiresConfirmation).
 *
 * Thresholds:
 * - >150 observations: Show confirmation dialog before viewing
 * - >350 observations: Disable log view entirely (performance concern)
 */

import { useState, useEffect, useCallback } from "react";

export const LOG_VIEW_CONFIRMATION_THRESHOLD = 150;
export const LOG_VIEW_DISABLED_THRESHOLD = 350;

interface UseLogViewConfirmationParams {
  observationCount: number;
  traceId: string;
}

interface UseLogViewConfirmationReturn {
  /** Whether log view is completely disabled (too many observations) */
  isDisabled: boolean;
  /** Whether confirmation is required before viewing */
  requiresConfirmation: boolean;
  /** Whether the confirmation dialog is open */
  showDialog: boolean;
  /** Set dialog open state */
  setShowDialog: (show: boolean) => void;
  /** Number of observations (for display in dialog) */
  observationCount: number;
  /**
   * Attempt to switch to log tab. Returns true if allowed, false if confirmation needed.
   * If confirmation is needed, opens the dialog automatically.
   */
  attemptLogView: () => boolean;
  /** Confirm and allow log view (call after user confirms in dialog) */
  confirmLogView: () => void;
}

export function useLogViewConfirmation({
  observationCount,
  traceId,
}: UseLogViewConfirmationParams): UseLogViewConfirmationReturn {
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const isDisabled = observationCount > LOG_VIEW_DISABLED_THRESHOLD;
  const requiresConfirmation =
    observationCount > LOG_VIEW_CONFIRMATION_THRESHOLD && !isDisabled;

  // Reset confirmation state when trace changes
  useEffect(() => {
    setHasConfirmed(false);
  }, [traceId]);

  const attemptLogView = useCallback(() => {
    if (requiresConfirmation && !hasConfirmed) {
      setShowDialog(true);
      return false;
    }
    return true;
  }, [requiresConfirmation, hasConfirmed]);

  const confirmLogView = useCallback(() => {
    setHasConfirmed(true);
    setShowDialog(false);
  }, []);

  return {
    isDisabled,
    requiresConfirmation,
    showDialog,
    setShowDialog,
    observationCount,
    attemptLogView,
    confirmLogView,
  };
}
