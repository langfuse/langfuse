import { useCallback, useEffect, useMemo } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";
import {
  IN_APP_AGENT_ACTIVITY_LIST_LIMIT,
  getInAppAgentActivityReceiptsStorageKey,
  getInAppAgentDeliveredReceiptsStorageKey,
  hasUnsettledInAppAgentActivity,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationHandled,
  reconcileInAppAgentActivity,
  type InAppAgentActivityByConversationId,
  type InAppAgentActivityConversation,
  type InAppAgentActivityReceipts,
  type InAppAgentDeliveredReceipts,
} from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import { api } from "@/src/utils/api";

const ACTIVITY_POLL_INTERVAL_MS = 4_000;

export function useInAppAgentActivity(params: {
  projectId: string;
  enabled: boolean;
  visibleConversationId: string | null;
}) {
  const { projectId, enabled, visibleConversationId } = params;
  const [receipts, setReceipts] = useLocalStorage<InAppAgentActivityReceipts>(
    getInAppAgentActivityReceiptsStorageKey(projectId),
    null,
  );
  const [delivered, setDelivered] =
    useLocalStorage<InAppAgentDeliveredReceipts>(
      getInAppAgentDeliveredReceiptsStorageKey(projectId),
      null,
    );

  const activityQuery = api.inAppAgent.listConversations.useQuery(
    { projectId, limit: IN_APP_AGENT_ACTIVITY_LIST_LIMIT },
    {
      enabled,
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
    if (activityQuery.data === undefined) {
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
  }, [activityQuery.data, conversations, receipts, visibleConversationId]);

  useEffect(() => {
    if (activityQuery.data === undefined || reconciled.receipts === receipts) {
      return;
    }

    setReceipts(reconciled.receipts);
  }, [activityQuery.data, receipts, reconciled.receipts, setReceipts]);

  const markConversationHandled = useCallback(
    (conversationId: string, activityKey: string) => {
      setReceipts((current) =>
        markInAppAgentConversationHandled(current, conversationId, activityKey),
      );
    },
    [setReceipts],
  );

  const markDelivered = useCallback(
    (
      entries: ReadonlyArray<{ conversationId: string; activityKey: string }>,
    ) => {
      setDelivered((current) =>
        markInAppAgentActivityDelivered(current, entries),
      );
    },
    [setDelivered],
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
