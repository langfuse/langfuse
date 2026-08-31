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

/** A conversation's activity the user has now seen. */
export type InAppAgentActivityAcknowledgement = {
  conversationId: string;
  activityKey: string;
};

type InAppAgentActivityEntry = {
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

const IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION = 1;
const IN_APP_AGENT_DELIVERED_RECEIPTS_VERSION = 1;

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
function pruneInAppAgentReceiptRecord(
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
 * An in-flight run can still be acknowledged by a tab whose poll froze before
 * the run settled, so only keys that can badge are worth recording.
 */
function isBadgeWorthyStatus(status: InAppAgentRunStatus): boolean {
  return (
    status === InAppAgentRunStatus.AWAITING_APPROVAL ||
    !isUnsettledInAppAgentRunStatus(status)
  );
}

/**
 * Read list summaries into UI state plus the receipts the caller should record.
 * Never returns a ledger: every tab shares one, so a tab that restates entries
 * it did not author can revert another tab's read receipt.
 */
export function reconcileInAppAgentActivity(params: {
  receipts: InAppAgentActivityReceipts;
  conversations: readonly InAppAgentActivityConversation[];
  visibleConversationId?: string | null;
}): {
  acknowledgements: InAppAgentActivityAcknowledgement[];
  activityByConversationId: InAppAgentActivityByConversationId;
  attentionCount: number;
} {
  const isFirstSync = params.receipts === null;
  const handled = params.receipts?.handled ?? {};
  const acknowledgements: InAppAgentActivityAcknowledgement[] = [];
  const acknowledgedKeys = new Map<string, string>();

  for (const conversation of params.conversations) {
    const run = conversation.latestRun;
    if (!run) {
      continue;
    }

    const activityKey = getInAppAgentActivityKey(run);
    const isVisible = params.visibleConversationId === conversation.id;

    // Baseline on first sync, then ack only what the user is looking at.
    if (
      (isFirstSync || isVisible) &&
      isBadgeWorthyStatus(run.status) &&
      handled[conversation.id] !== activityKey
    ) {
      acknowledgements.push({ conversationId: conversation.id, activityKey });
      acknowledgedKeys.set(conversation.id, activityKey);
    }
  }

  const activityByConversationId: InAppAgentActivityByConversationId =
    new Map();
  let attentionCount = 0;

  for (const conversation of params.conversations) {
    const run = conversation.latestRun;
    if (!run) {
      continue;
    }

    const activityKey = getInAppAgentActivityKey(run);
    const entry = getActivityEntry({
      run,
      title: conversation.title,
      isHandled:
        handled[conversation.id] === activityKey ||
        acknowledgedKeys.get(conversation.id) === activityKey,
    });

    if (!entry) {
      continue;
    }

    activityByConversationId.set(conversation.id, entry);
    if (entry.needsAttention) {
      attentionCount += 1;
    }
  }

  return { acknowledgements, activityByConversationId, attentionCount };
}

/**
 * Record acknowledgements key by key. Returns the same reference when they are
 * all already present so callers can write during render without looping.
 */
export function mergeInAppAgentReceipts(
  receipts: InAppAgentActivityReceipts,
  acknowledgements: readonly InAppAgentActivityAcknowledgement[],
): InAppAgentActivityReceipts {
  // A null ledger has never been baselined, so it must be written even when
  // this sync had nothing to acknowledge — otherwise every later sync counts
  // as the first one and keeps marking new activity as already seen.
  let changed = receipts === null;
  const next = { ...(receipts?.handled ?? {}) };

  for (const acknowledgement of acknowledgements) {
    if (next[acknowledgement.conversationId] !== acknowledgement.activityKey) {
      next[acknowledgement.conversationId] = acknowledgement.activityKey;
      changed = true;
    }
  }

  return changed
    ? { v: IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION, handled: next }
    : receipts;
}

/** Drop ledger keys for conversations no longer in the activity window. */
export function pruneInAppAgentReceipts(
  receipts: InAppAgentActivityReceipts,
  liveConversationIds: ReadonlySet<string>,
): InAppAgentActivityReceipts {
  if (!receipts) {
    return receipts;
  }

  const pruned = pruneInAppAgentReceiptRecord(
    receipts.handled,
    liveConversationIds,
  );
  if (!pruned.changed) {
    return receipts;
  }

  return {
    v: IN_APP_AGENT_ACTIVITY_RECEIPTS_VERSION,
    handled: pruned.record,
  };
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

/**
 * The activity poll only needs to tick while the server can still change a
 * run on its own. Parked approvals wait on the user; `refetchOnWindowFocus`
 * is enough if another tab decides them.
 */
export function hasInFlightInAppAgentActivity(
  conversations: readonly InAppAgentActivityConversation[],
): boolean {
  return conversations.some((conversation) => {
    const status = conversation.latestRun?.status;
    return (
      status === InAppAgentRunStatus.QUEUED ||
      status === InAppAgentRunStatus.RUNNING
    );
  });
}
