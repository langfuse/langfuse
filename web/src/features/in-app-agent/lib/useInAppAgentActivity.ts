import { useCallback, useEffect, useMemo } from "react";

import { isUnsettledInAppAgentRunStatus } from "@langfuse/shared/in-app-agent";

import useLocalStorage from "@/src/components/useLocalStorage";
import {
  IN_APP_AGENT_ACTIVITY_TRACKED_RUN_ID_LIMIT,
  getInAppAgentActivityByConversationId,
  getInAppAgentActivityLedgerStorageKey,
  getInAppAgentAttentionCount,
  getInAppAgentTrackedRunIds,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationSeen,
  reconcileInAppAgentActivityLedger,
  type InAppAgentActivityLedger,
  type InAppAgentActivityRunSummary,
} from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import { api } from "@/src/utils/api";

/** Fast enough that a finished run feels immediate; only ever while pending. */
const ACTIVITY_POLL_INTERVAL_MS = 4_000;

function useIsDocumentVisible(): () => boolean {
  return useCallback(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible",
    [],
  );
}

/**
 * Cross-conversation assistant activity: what is running, what needs approval,
 * and what finished without the user noticing.
 *
 * Polls only while something is pending and *not already covered by the live
 * transcript session*. With nothing running this issues no requests at all —
 * which is the entire reason this replaces a watch stream per conversation
 * rather than sitting alongside them.
 */
export function useInAppAgentActivity(params: {
  projectId: string;
  enabled: boolean;
  /** Runs this tab knows about first-hand, from the attached session. */
  localRuns: readonly InAppAgentActivityRunSummary[];
  /** The conversation the user can actually see right now, if any. */
  visibleConversationId: string | null;
  /** Conversations whose live session already reports every transition. */
  isCoveredByLiveSession: (conversationId: string) => boolean;
}) {
  const {
    projectId,
    enabled,
    localRuns,
    visibleConversationId,
    isCoveredByLiveSession,
  } = params;
  const [ledger, setLedger] = useLocalStorage<InAppAgentActivityLedger>(
    getInAppAgentActivityLedgerStorageKey(projectId),
    null,
  );
  const getIsDocumentVisible = useIsDocumentVisible();

  const trackedRunIds = useMemo(
    () =>
      getInAppAgentTrackedRunIds(
        ledger,
        IN_APP_AGENT_ACTIVITY_TRACKED_RUN_ID_LIMIT,
      ),
    [ledger],
  );

  const hasPendingUncoveredRun = useMemo(
    () =>
      Object.entries(ledger?.entries ?? {}).some(
        ([conversationId, entry]) =>
          isUnsettledInAppAgentRunStatus(entry.status) &&
          !isCoveredByLiveSession(conversationId),
      ),
    [isCoveredByLiveSession, ledger],
  );

  // `limit: 1` because this caller wants only the `activity` sidecar; the
  // conversation page it also returns is the cheapest one that can exist. The
  // drawer's own infinite list is a separate cache entry with its own page size.
  const activityQuery = api.inAppAgent.listConversations.useQuery(
    { projectId, limit: 1, trackedRunIds },
    {
      enabled,
      // Two gates, both cheap: no slow idle tick when nothing is pending, and
      // `refetchIntervalInBackground: false` parks the poll entirely while the
      // tab is hidden — a background tab with a run in flight costs nothing
      // until someone looks at it again, which is also when it catches up.
      refetchInterval: hasPendingUncoveredRun
        ? ACTIVITY_POLL_INTERVAL_MS
        : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  );

  const runs = useMemo(
    () => [...(activityQuery.data?.activity ?? []), ...localRuns],
    [activityQuery.data?.activity, localRuns],
  );

  /**
   * localStorage is the external system this synchronizes with, and it is
   * shared with every other tab, so the reconcile is written only when it
   * actually changes something — `reconcileInAppAgentActivityLedger` returns
   * the same reference otherwise.
   */
  useEffect(() => {
    // A disabled query never resolves, so undefined data is also the
    // feature-off case — no separate guard needed.
    if (activityQuery.data === undefined) {
      return;
    }

    const next = reconcileInAppAgentActivityLedger({
      ledger,
      runs,
      requestedRunIds: trackedRunIds,
      visibleConversationId: getIsDocumentVisible()
        ? visibleConversationId
        : null,
    });

    // `useLocalStorage` writes and broadcasts on every call, and its own
    // listener re-parses that broadcast into a fresh object — so an unchanged
    // reconcile must not reach it at all, or identity churns forever.
    if (next !== ledger) {
      setLedger(next);
    }
  }, [
    ledger,
    activityQuery.data,
    getIsDocumentVisible,
    runs,
    setLedger,
    trackedRunIds,
    visibleConversationId,
  ]);

  const markConversationSeen = useCallback(
    (conversationId: string) => {
      setLedger((current) =>
        markInAppAgentConversationSeen(current, conversationId),
      );
    },
    [setLedger],
  );

  const markDelivered = useCallback(
    (conversationIds: readonly string[]) => {
      setLedger((current) =>
        markInAppAgentActivityDelivered(current, conversationIds),
      );
    },
    [setLedger],
  );

  /**
   * Returning to the tab is the one "the user is looking at it now" signal that
   * arrives from outside React, so it is the one that needs a listener.
   */
  useEffect(() => {
    if (!visibleConversationId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markConversationSeen(visibleConversationId);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markConversationSeen, visibleConversationId]);

  return useMemo(
    () => ({
      activityByConversationId: getInAppAgentActivityByConversationId(ledger),
      attentionCount: getInAppAgentAttentionCount(ledger),
      markConversationSeen,
      markDelivered,
    }),
    [ledger, markConversationSeen, markDelivered],
  );
}
