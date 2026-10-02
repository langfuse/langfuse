import posthog from "posthog-js";

import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { readPathToggleStore } from "@/src/features/events/stores/readPathToggleStore";
import { showErrorToast } from "@/src/features/notifications";
import { V4_BETA_ENABLED_POSTHOG_PROPERTY } from "@/src/features/posthog-analytics";
import { setV4BetaEnabledSentryTag } from "@/src/utils/sentryV4BetaTag";

type SetReadPathDeps = {
  /** `api.userAccount.setV4BetaEnabled` mutateAsync, wired by the toggle surface. */
  setV4BetaEnabled: (input: {
    enabled: boolean;
  }) => Promise<{ v4BetaEnabled: boolean }>;
  /**
   * next-auth session update. Returns null on failure (it never throws) —
   * a failed refresh is a failed toggle.
   */
  updateSession: () => Promise<unknown>;
  /** Runs only after the toggle fully committed (mutation + session update). */
  onSuccess?: () => void | Promise<unknown>;
};

/**
 * The one toggle workflow shared by every read-path toggle surface. The
 * switch renders `pendingReadPath ?? session read path`, so on any failure —
 * an unrefreshed session would leave the UI on the old read path while the
 * server is on the new one, so a failed `updateSession` counts too — clearing
 * the pending intent snaps the switch back to the session's value.
 */
export async function setReadPath(
  target: ResolvedReadPath,
  deps: SetReadPathDeps,
): Promise<void> {
  const { pendingReadPath, actions } = readPathToggleStore.getState();
  if (pendingReadPath !== null) return;
  actions.begin(target);

  try {
    // The server may override the requested value (e.g. events_only ignores
    // an opt-out) — analytics and Sentry tag follow what it actually set.
    const { v4BetaEnabled } = await deps.setV4BetaEnabled({
      enabled: target === "v4",
    });
    posthog.setPersonProperties({
      [V4_BETA_ENABLED_POSTHOG_PROPERTY]: v4BetaEnabled,
    });
    posthog.register({
      [V4_BETA_ENABLED_POSTHOG_PROPERTY]: v4BetaEnabled,
    });
    setV4BetaEnabledSentryTag(v4BetaEnabled);
    const updatedSession = await deps.updateSession();
    if (!updatedSession) {
      throw new Error(
        "The setting was saved but the session could not be refreshed",
      );
    }
  } catch (error) {
    actions.settle();
    showErrorToast(
      target === "v4" ? "Could not switch to V4" : "Could not switch to V3",
      error instanceof Error ? error.message : "Please try again.",
    );
    return;
  }

  // Pending intent is kept through onSuccess (the post-toggle redirect) so
  // the switch stays disabled until navigation lands. The toggle itself has
  // committed at this point — a failed redirect must not read as a failed
  // toggle (and callers do not await this workflow).
  try {
    await deps.onSuccess?.();
  } catch {
    // best-effort post-toggle navigation
  } finally {
    actions.settle();
  }
}
