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
  /** Row / status indicator (approvals stay while the run still needs a decision). */
  state: InAppAgentActivityState;
  /** Badge + toast attention; false after the user has looked at this activity key. */
  needsAttention: boolean;
};

export type InAppAgentActivityByConversationId = Map<
  string,
  InAppAgentActivityEntry
>;

export const IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION = 1;
export const IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION = 1;

/**
 * Activity polls the newest N conversations only (same page as the drawer list
 * head). Accepted scope: a quieter conversation that falls outside this window
 * will not contribute badge/toast attention until it is bumped back into the
 * page (e.g. by a new message). Revisit if parked approvals must never drop off.
 *
 * Handled/delivered receipts are localStorage per browser profile per user —
 * not synced across devices or accounts. A new profile/user baselines the
 * current newest-N as already seen.
 */
export const IN_APP_AGENT_ACTIVITY_LIST_LIMIT = 50;

export function getInAppAgentActivityReceiptsStorageKey(
  projectId: string,
  userId: string,
) {
  return `langfuse-in-app-agent-activity:v${IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION}:${projectId}:${userId}`;
}

export function getInAppAgentDeliveredReceiptsStorageKey(
  projectId: string,
  userId: string,
) {
  return `langfuse-in-app-agent-delivered:v${IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION}:${projectId}:${userId}`;
}

export function getInAppAgentActivityKey(run: {
  id: string;
  status: InAppAgentRunStatus;
}): string {
  return `${run.id}:${run.status}`;
}

/**
 * Derive list state + whether it still owes a badge/toast.
 * Approvals keep list status after being seen; terminals drop out once handled.
 */
function getActivityEntry(params: {
  run: InAppAgentConversationLatestRun;
  title: string | null;
  isHandled: boolean;
}): InAppAgentActivityEntry | null {
  const activityKey = getInAppAgentActivityKey(params.run);

  if (params.run.status === InAppAgentRunStatus.AWAITING_APPROVAL) {
    return {
      activityKey,
      runId: params.run.id,
      title: params.title,
      state: "approval",
      needsAttention: !params.isHandled,
    };
  }

  if (isUnsettledInAppAgentRunStatus(params.run.status)) {
    return {
      activityKey,
      runId: params.run.id,
      title: params.title,
      state: "running",
      needsAttention: false,
    };
  }

  if (params.run.status === InAppAgentRunStatus.CANCELLED || params.isHandled) {
    return null;
  }

  return {
    activityKey,
    runId: params.run.id,
    title: params.title,
    state:
      params.run.status === InAppAgentRunStatus.FAILED
        ? "failed-unread"
        : "done-unread",
    needsAttention: true,
  };
}

/** Drop ledger keys for conversations no longer in the activity window. */
export function pruneInAppAgentReceiptRecord(
  record: Record<string, string>,
  liveConversationIds: ReadonlySet<string>,
): { record: Record<string, string>; changed: boolean } {
  let changed = false;
  const next: Record<string, string> = {};

  for (const [conversationId, activityKey] of Object.entries(record)) {
    if (!liveConversationIds.has(conversationId)) {
      changed = true;
      continue;
    }
    next[conversationId] = activityKey;
  }

  return { record: changed ? next : record, changed };
}

export function pruneInAppAgentDeliveredReceipts(
  delivered: InAppAgentDeliveredReceipts,
  liveConversationIds: ReadonlySet<string>,
): InAppAgentDeliveredReceipts {
  if (!delivered) {
    return delivered;
  }

  const pruned = pruneInAppAgentReceiptRecord(
    delivered.delivered,
    liveConversationIds,
  );
  if (!pruned.changed) {
    return delivered;
  }

  return {
    v: IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION,
    delivered: pruned.record,
  };
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
  const liveConversationIds = new Set(
    params.conversations.map((conversation) => conversation.id),
  );

  for (const conversation of params.conversations) {
    const run = conversation.latestRun;
    if (!run) {
      continue;
    }

    const activityKey = getInAppAgentActivityKey(run);
    const previousKey = previousHandled[conversation.id];
    const isVisible = params.visibleConversationId === conversation.id;

    // Baseline on first sync, then ack only what the user is looking at. Acking an
    // in-flight run lets a tab whose poll froze mid-run walk a newer receipt back.
    if (isFirstSync || isVisible) {
      if (previousKey !== activityKey) {
        nextHandled[conversation.id] = activityKey;
        handledChanged = true;
      }
    }
  }

  const prunedHandled = pruneInAppAgentReceiptRecord(
    nextHandled,
    liveConversationIds,
  );
  handledChanged = handledChanged || prunedHandled.changed;

  const receipts: InAppAgentActivityReceipts = handledChanged
    ? {
        v: IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION,
        handled: prunedHandled.record,
      }
    : params.receipts;

  const activityByConversationId: InAppAgentActivityByConversationId =
    new Map();
  let attentionCount = 0;

  for (const conversation of params.conversations) {
    const run = conversation.latestRun;
    if (!run) {
      continue;
    }

    const entry = getActivityEntry({
      run,
      title: conversation.title,
      isHandled:
        receipts?.handled[conversation.id] === getInAppAgentActivityKey(run),
    });

    if (!entry) {
      continue;
    }

    activityByConversationId.set(conversation.id, entry);
    if (entry.needsAttention) {
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
      !entry.needsAttention ||
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
