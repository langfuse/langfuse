import { InAppAgentRunStatus } from "@langfuse/shared";
import { isUnsettledInAppAgentRunStatus } from "@langfuse/shared/in-app-agent";

export type InAppAgentActivityState =
  | "running"
  | "approval"
  | "failed-unread"
  | "done-unread";

export type InAppAgentConversationLatestRun = {
  id: string;
  status: InAppAgentRunStatus;
  errorCode: string | null;
  cancelRequested: boolean;
};

export type InAppAgentActivityConversation = {
  id: string;
  title: string | null;
  latestRun: InAppAgentConversationLatestRun | null;
};

/** `null` means this device has never baselined the project's activity. */
export type InAppAgentActivityReceipts = {
  v: 1;
  handled: Record<string, string>;
} | null;

export type InAppAgentDeliveredReceipts = {
  v: 1;
  delivered: Record<string, string>;
} | null;

export type InAppAgentActivityEntry = {
  activityKey: string;
  runId: string;
  title: string | null;
  state: InAppAgentActivityState;
};

export type InAppAgentActivityByConversationId = Map<
  string,
  InAppAgentActivityEntry
>;

export const IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION = 1;
export const IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION = 1;
export const IN_APP_AGENT_ACTIVITY_LIST_LIMIT = 50;

export function getInAppAgentActivityReceiptsStorageKey(projectId: string) {
  return `langfuse-in-app-agent-activity:v${IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION}:${projectId}`;
}

export function getInAppAgentDeliveredReceiptsStorageKey(projectId: string) {
  return `langfuse-in-app-agent-delivered:v${IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION}:${projectId}`;
}

export function getInAppAgentActivityKey(run: {
  id: string;
  status: InAppAgentRunStatus;
}): string {
  return `${run.id}:${run.status}`;
}

function isTerminalResult(status: InAppAgentRunStatus): boolean {
  return (
    status === InAppAgentRunStatus.SUCCEEDED ||
    status === InAppAgentRunStatus.FAILED
  );
}

function getActivityState(params: {
  status: InAppAgentRunStatus;
  isHandled: boolean;
}): InAppAgentActivityState | null {
  if (params.status === InAppAgentRunStatus.AWAITING_APPROVAL) {
    return "approval";
  }

  if (isUnsettledInAppAgentRunStatus(params.status)) {
    return "running";
  }

  if (params.status === InAppAgentRunStatus.CANCELLED || params.isHandled) {
    return null;
  }

  return params.status === InAppAgentRunStatus.FAILED
    ? "failed-unread"
    : "done-unread";
}

/**
 * Fold list summaries into handled receipts and derived UI state.
 * Returns the same receipts reference when nothing changed.
 */
export function reconcileInAppAgentActivity(params: {
  receipts: InAppAgentActivityReceipts;
  conversations: readonly InAppAgentActivityConversation[];
  visibleConversationId?: string | null;
}): {
  receipts: InAppAgentActivityReceipts;
  activityByConversationId: InAppAgentActivityByConversationId;
  attentionCount: number;
} {
  const isFirstSync = params.receipts === null;
  const previousHandled = params.receipts?.handled ?? {};
  const nextHandled: Record<string, string> = { ...previousHandled };
  let handledChanged = isFirstSync;

  for (const conversation of params.conversations) {
    const run = conversation.latestRun;
    if (!run) {
      continue;
    }

    const activityKey = getInAppAgentActivityKey(run);
    const previousKey = previousHandled[conversation.id];
    const isVisible = params.visibleConversationId === conversation.id;

    if (
      isFirstSync ||
      !isTerminalResult(run.status) ||
      (isVisible && isTerminalResult(run.status))
    ) {
      if (previousKey !== activityKey) {
        nextHandled[conversation.id] = activityKey;
        handledChanged = true;
      }
    }
  }

  const receipts: InAppAgentActivityReceipts = handledChanged
    ? { v: IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION, handled: nextHandled }
    : params.receipts;

  const activityByConversationId: InAppAgentActivityByConversationId =
    new Map();
  let attentionCount = 0;

  for (const conversation of params.conversations) {
    const run = conversation.latestRun;
    if (!run) {
      continue;
    }

    const activityKey = getInAppAgentActivityKey(run);
    const state = getActivityState({
      status: run.status,
      isHandled: receipts?.handled[conversation.id] === activityKey,
    });

    if (!state) {
      continue;
    }

    activityByConversationId.set(conversation.id, {
      activityKey,
      runId: run.id,
      title: conversation.title,
      state,
    });

    if (state !== "running") {
      attentionCount += 1;
    }
  }

  return { receipts, activityByConversationId, attentionCount };
}

export function markInAppAgentConversationHandled(
  receipts: InAppAgentActivityReceipts,
  conversationId: string,
  activityKey: string,
): InAppAgentActivityReceipts {
  if (!receipts || receipts.handled[conversationId] === activityKey) {
    return receipts;
  }

  return {
    ...receipts,
    handled: { ...receipts.handled, [conversationId]: activityKey },
  };
}

export function markInAppAgentActivityDelivered(
  delivered: InAppAgentDeliveredReceipts,
  entries: ReadonlyArray<{ conversationId: string; activityKey: string }>,
): InAppAgentDeliveredReceipts {
  const current = delivered?.delivered ?? {};
  let changed = delivered === null;
  const next = { ...current };

  for (const entry of entries) {
    if (next[entry.conversationId] !== entry.activityKey) {
      next[entry.conversationId] = entry.activityKey;
      changed = true;
    }
  }

  return changed
    ? { v: IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION, delivered: next }
    : delivered;
}

export function getInAppAgentPendingNotificationCards(params: {
  activityByConversationId: InAppAgentActivityByConversationId;
  delivered: InAppAgentDeliveredReceipts;
}): Array<{
  conversationId: string;
  activityKey: string;
  runId: string;
  title: string | null;
  state: Exclude<InAppAgentActivityState, "running">;
}> {
  return [...params.activityByConversationId.entries()].flatMap(
    ([conversationId, entry]) =>
      entry.state === "running" ||
      params.delivered?.delivered[conversationId] === entry.activityKey
        ? []
        : [
            {
              conversationId,
              activityKey: entry.activityKey,
              runId: entry.runId,
              title: entry.title,
              state: entry.state,
            },
          ],
  );
}

export function hasUnsettledInAppAgentActivity(
  conversations: readonly InAppAgentActivityConversation[],
): boolean {
  return conversations.some(
    (conversation) =>
      conversation.latestRun != null &&
      isUnsettledInAppAgentRunStatus(conversation.latestRun.status),
  );
}
