import { useCallback, useEffect, useMemo } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";
import {
  IN_APP_AGENT_ACTIVITY_LIST_LIMIT,
  getInAppAgentActivityReceiptsStorageKey,
  getInAppAgentDeliveredReceiptsStorageKey,
  hasUnsettledInAppAgentActivity,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationHandled,
  pruneInAppAgentDeliveredReceipts,
  reconcileInAppAgentActivity,
  type InAppAgentActivityByConversationId,
  type InAppAgentActivityConversation,
  type InAppAgentActivityReceipts,
  type InAppAgentDeliveredReceipts,
} from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import { api } from "@/src/utils/api";

const ACTIVITY_POLL_INTERVAL_MS = 4_000;

/**
 * Placeholder key while session.user.id is still loading. Never written —
 * polling and ledger sync stay disabled until a real userId arrives (and the
 * provider remounts the hook with that id so useLocalStorage re-reads).
 */
const PENDING_ACTIVITY_STORAGE_KEY =
  "langfuse-in-app-agent-activity:v1:__pending__";
const PENDING_DELIVERED_STORAGE_KEY =
  "langfuse-in-app-agent-delivered:v1:__pending__";

export function useInAppAgentActivity(params: {
  projectId: string;
  userId: string | null;
  enabled: boolean;
  visibleConversationId: string | null;
}) {
  const { projectId, userId, enabled, visibleConversationId } = params;
  const ledgerReady = Boolean(userId);
  const pollEnabled = enabled && ledgerReady;

  const [receipts, setReceipts] = useLocalStorage<InAppAgentActivityReceipts>(
    userId
      ? getInAppAgentActivityReceiptsStorageKey(projectId, userId)
      : PENDING_ACTIVITY_STORAGE_KEY,
    null,
  );
  const [delivered, setDelivered] =
    useLocalStorage<InAppAgentDeliveredReceipts>(
      userId
        ? getInAppAgentDeliveredReceiptsStorageKey(projectId, userId)
        : PENDING_DELIVERED_STORAGE_KEY,
      null,
    );

  // Newest-N only; see IN_APP_AGENT_ACTIVITY_LIST_LIMIT.
  const activityQuery = api.inAppAgent.listConversations.useQuery(
    { projectId, limit: IN_APP_AGENT_ACTIVITY_LIST_LIMIT },
    {
      enabled: pollEnabled,
      refetchInterval: (query) =>
        hasUnsettledInAppAgentActivity(query.state.data?.conversations ?? [])
          ? ACTIVITY_POLL_INTERVAL_MS
          : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  );

  const conversations = useMemo<InAppAgentActivityConversation[]>(
    () =>
      (activityQuery.data?.conversations ?? []).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        latestRun: conversation.latestRun,
      })),
    [activityQuery.data?.conversations],
  );

  const reconciled = useMemo(() => {
    if (!ledgerReady || activityQuery.data === undefined) {
      return {
        receipts,
        activityByConversationId:
          new Map() as InAppAgentActivityByConversationId,
        attentionCount: 0,
      };
    }

    return reconcileInAppAgentActivity({
      receipts,
      conversations,
      visibleConversationId:
        typeof document === "undefined" ||
        document.visibilityState === "visible"
          ? visibleConversationId
          : null,
    });
  }, [
    activityQuery.data,
    conversations,
    ledgerReady,
    receipts,
    visibleConversationId,
  ]);

  // Adjust the localStorage ledger while rendering when the activity snapshot
  // changes (https://react.dev/learn/you-might-not-need-an-effect). Idempotent:
  // unchanged references skip setState, so React does not loop.
  if (ledgerReady && activityQuery.data !== undefined) {
    if (reconciled.receipts !== receipts) {
      setReceipts(reconciled.receipts);
    }

    const liveConversationIds = new Set(
      conversations.map((conversation) => conversation.id),
    );
    const nextDelivered = pruneInAppAgentDeliveredReceipts(
      delivered,
      liveConversationIds,
    );
    if (nextDelivered !== delivered) {
      setDelivered(nextDelivered);
    }
  }

  const markConversationHandled = useCallback(
    (conversationId: string, activityKey: string) => {
      if (!ledgerReady) {
        return;
      }
      setReceipts((current) =>
        markInAppAgentConversationHandled(current, conversationId, activityKey),
      );
    },
    [ledgerReady, setReceipts],
  );

  const markDelivered = useCallback(
    (
      entries: ReadonlyArray<{ conversationId: string; activityKey: string }>,
    ) => {
      if (!ledgerReady) {
        return;
      }
      setDelivered((current) =>
        markInAppAgentActivityDelivered(current, entries),
      );
    },
    [ledgerReady, setDelivered],
  );

  useEffect(() => {
    if (!visibleConversationId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const entry = reconciled.activityByConversationId.get(
        visibleConversationId,
      );
      if (entry?.needsAttention) {
        markConversationHandled(visibleConversationId, entry.activityKey);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    markConversationHandled,
    reconciled.activityByConversationId,
    visibleConversationId,
  ]);

  return useMemo(
    () => ({
      activityByConversationId: reconciled.activityByConversationId,
      attentionCount: reconciled.attentionCount,
      delivered,
      refetchActivity: activityQuery.refetch,
      markConversationHandled,
      markDelivered,
    }),
    [
      activityQuery.refetch,
      delivered,
      markConversationHandled,
      markDelivered,
      reconciled.activityByConversationId,
      reconciled.attentionCount,
    ],
  );
}
