import { InAppAgentRunStatus } from "@langfuse/shared";
import { isUnsettledInAppAgentRunStatus } from "@langfuse/shared/in-app-agent";

/**
 * Cross-conversation activity state for the assistant.
 *
 * The ledger, not the server, is the source of unread truth. The server answers
 * only "what is the current status of these runs"; whether the user still owes
 * a conversation their attention is client state, because it depends on what
 * this person has actually looked at. That split is what keeps the server query
 * a pure read and lets it stay silent while nothing is pending.
 */

export type InAppAgentActivityRunSummary = {
  conversationId: string;
  title: string | null;
  runId: string;
  status: InAppAgentRunStatus;
  errorCode: string | null;
  cancelRequested: boolean;
};

export type InAppAgentActivityEntry = {
  runId: string;
  status: InAppAgentRunStatus;
  title: string | null;
  /** The user has looked at this run's conversation since it reached this run. */
  seen: boolean;
  /** A notification for this run has been shown (and must not be shown twice). */
  toastDelivered: boolean;
};

/**
 * `null` means "never initialized on this device", which is materially
 * different from "initialized and currently empty": the first sync baselines
 * pre-existing history as acknowledged, and doing that twice would swallow
 * completions.
 */
export type InAppAgentActivityLedger = {
  v: 1;
  entries: Record<string, InAppAgentActivityEntry>;
} | null;

export type InAppAgentActivityState =
  | "running"
  | "approval"
  | "failed-unread"
  | "done-unread";

export const IN_APP_AGENT_ACTIVITY_LEDGER_VERSION = 1;

/**
 * Upper bound on run ids one activity request may adjudicate. Well above the
 * per-user concurrency ceiling, and safe to hit: the ledger keeps unread state
 * itself, so truncating a request defers a verdict rather than losing one.
 */
export const IN_APP_AGENT_ACTIVITY_TRACKED_RUN_ID_LIMIT = 20;

/** Bound on retained acknowledgements; only settled, acknowledged ones evict. */
export const IN_APP_AGENT_ACTIVITY_LEDGER_MAX_ENTRIES = 200;

export function getInAppAgentActivityLedgerStorageKey(projectId: string) {
  return `langfuse-in-app-agent-activity:v${IN_APP_AGENT_ACTIVITY_LEDGER_VERSION}:${projectId}`;
}

function isTerminal(status: InAppAgentRunStatus): boolean {
  return !isUnsettledInAppAgentRunStatus(status);
}

/**
 * A cancelled run is the one terminal outcome the user already knows about:
 * they are the one who stopped it. It never becomes unread and never notifies,
 * so it is born fully acknowledged and prunes on the next reconcile.
 */
function isSelfEvident(status: InAppAgentRunStatus): boolean {
  return status === InAppAgentRunStatus.CANCELLED;
}

/**
 * Fold a batch of run summaries into the ledger.
 *
 * Returns the *same reference* when nothing changed. Callers persist to
 * localStorage on change, and localStorage writes are broadcast to every other
 * tab, so an unstable identity here would turn a quiet poll into a storm.
 */
export function reconcileInAppAgentActivityLedger(params: {
  ledger: InAppAgentActivityLedger;
  runs: readonly InAppAgentActivityRunSummary[];
  /**
   * Run ids the client asked the server to adjudicate. Any of them missing from
   * `runs` no longer exists for this user (deleted conversation, revoked
   * access) and is dropped rather than tracked forever.
   */
  requestedRunIds?: readonly string[];
  /**
   * The conversation the user is demonstrably looking at right now, if any.
   * Anything landing here is seen on arrival — the user is watching it happen.
   */
  visibleConversationId?: string | null;
}): InAppAgentActivityLedger {
  const isFirstSync = params.ledger === null;
  const previousEntries = params.ledger?.entries ?? {};
  const nextEntries: Record<string, InAppAgentActivityEntry> = {};

  for (const [conversationId, entry] of Object.entries(previousEntries)) {
    nextEntries[conversationId] = entry;
  }

  for (const run of params.runs) {
    const previous = previousEntries[run.conversationId];
    // Acknowledgement carries over only within the same run. A newer run in a
    // conversation the user already read is unread again.
    const sameRun = previous?.runId === run.runId ? previous : undefined;
    const isVisible = params.visibleConversationId === run.conversationId;

    /**
     * A run's outcome is monotonic: once it has finished it can never be
     * executing again, so a report saying otherwise is stale and is dropped.
     *
     * This is load-bearing, not defensive. The tracked-run request is derived
     * from this ledger, so settling a run changes the request and therefore the
     * query cache entry it reads from — and the entry it switches to may hold a
     * reply fetched while that same run was still executing. Accepting it flips
     * the run back to running, which switches the request back, which reads the
     * finished reply again: the two caches oscillate forever and React tears
     * the tree down with "maximum update depth exceeded".
     */
    if (sameRun && isTerminal(sameRun.status) && !isTerminal(run.status)) {
      continue;
    }

    // A first sync acknowledges history so an existing backlog does not light
    // up — but only history that is actually finished. Baselining an in-flight
    // run would silently swallow the completion this feature exists to report.
    const acknowledgedOnArrival =
      isVisible ||
      isSelfEvident(run.status) ||
      (isFirstSync && !previous && isTerminal(run.status));

    const next: InAppAgentActivityEntry = {
      runId: run.runId,
      status: run.status,
      title: run.title,
      seen: acknowledgedOnArrival || sameRun?.seen === true,
      toastDelivered: acknowledgedOnArrival || sameRun?.toastDelivered === true,
    };

    nextEntries[run.conversationId] = next;
  }

  const returnedRunIds = new Set(params.runs.map((run) => run.runId));

  /**
   * An acknowledged entry is kept, not deleted.
   *
   * It is the only record that this run was already dealt with, and the local
   * session republishes the selected conversation's run on every render for as
   * long as it stays selected. Deleting on acknowledgement therefore erased the
   * memory and let the very next non-visible render resurrect the same run as
   * unread — the badge ticking up whenever the drawer closed, and a result card
   * that came back no matter how often it was dismissed.
   *
   * Only entries whose run no longer exists for this user are dropped.
   */
  for (const [conversationId, entry] of Object.entries(nextEntries)) {
    const wasRequestedAndMissing =
      params.requestedRunIds?.includes(entry.runId) === true &&
      !returnedRunIds.has(entry.runId);

    if (wasRequestedAndMissing) {
      delete nextEntries[conversationId];
    }
  }

  evictAcknowledgedOverflow(nextEntries);

  /**
   * Compare the *outcome*, never a "something happened" flag.
   *
   * A run can be added and dropped within one pass, which a flag would call a
   * change forever. Each new object writes to localStorage, whose cross-tab
   * event re-parses it into yet another object, and the render loop never
   * settles (React #185).
   */
  return isFirstSync || hasLedgerChanged(previousEntries, nextEntries)
    ? { v: IN_APP_AGENT_ACTIVITY_LEDGER_VERSION, entries: nextEntries }
    : params.ledger;
}

/**
 * Keeping acknowledged entries means the ledger grows with the number of
 * conversations the user has ever run, so settled-and-acknowledged ones are
 * evicted oldest-first once it gets large. Anything still owed to the user is
 * never evicted, however old.
 */
function evictAcknowledgedOverflow(
  entries: Record<string, InAppAgentActivityEntry>,
): void {
  const conversationIds = Object.keys(entries);
  let overflow =
    conversationIds.length - IN_APP_AGENT_ACTIVITY_LEDGER_MAX_ENTRIES;

  if (overflow <= 0) {
    return;
  }

  // Insertion order, so the longest-untouched acknowledged entries go first.
  for (const conversationId of conversationIds) {
    const entry = entries[conversationId];

    if (
      entry &&
      isTerminal(entry.status) &&
      entry.seen &&
      entry.toastDelivered
    ) {
      delete entries[conversationId];
      overflow -= 1;

      if (overflow <= 0) {
        return;
      }
    }
  }
}

function hasLedgerChanged(
  previousEntries: Record<string, InAppAgentActivityEntry>,
  nextEntries: Record<string, InAppAgentActivityEntry>,
): boolean {
  const nextConversationIds = Object.keys(nextEntries);

  if (nextConversationIds.length !== Object.keys(previousEntries).length) {
    return true;
  }

  return nextConversationIds.some((conversationId) => {
    const previous = previousEntries[conversationId];
    const next = nextEntries[conversationId];

    return (
      !previous ||
      !next ||
      previous.runId !== next.runId ||
      previous.status !== next.status ||
      previous.title !== next.title ||
      previous.seen !== next.seen ||
      previous.toastDelivered !== next.toastDelivered
    );
  });
}

/** Mark one conversation as looked at. Same-reference on no-op. */
export function markInAppAgentConversationSeen(
  ledger: InAppAgentActivityLedger,
  conversationId: string,
): InAppAgentActivityLedger {
  const entry = ledger?.entries[conversationId];

  if (!ledger || !entry || entry.seen) {
    return ledger;
  }

  return {
    ...ledger,
    entries: { ...ledger.entries, [conversationId]: { ...entry, seen: true } },
  };
}

/** Record that a run's notification has been shown. Same-reference on no-op. */
export function markInAppAgentActivityDelivered(
  ledger: InAppAgentActivityLedger,
  conversationIds: readonly string[],
): InAppAgentActivityLedger {
  if (!ledger) {
    return ledger;
  }

  const undelivered = conversationIds.flatMap((conversationId) => {
    const entry = ledger.entries[conversationId];
    return entry && !entry.toastDelivered
      ? [[conversationId, entry] as const]
      : [];
  });

  if (undelivered.length === 0) {
    return ledger;
  }

  const entries = { ...ledger.entries };
  for (const [conversationId, entry] of undelivered) {
    entries[conversationId] = { ...entry, toastDelivered: true };
  }

  return { ...ledger, entries };
}

export function getInAppAgentActivityState(
  entry: InAppAgentActivityEntry,
): InAppAgentActivityState | null {
  if (entry.status === InAppAgentRunStatus.AWAITING_APPROVAL) {
    return "approval";
  }

  if (isUnsettledInAppAgentRunStatus(entry.status)) {
    return "running";
  }

  if (entry.seen || isSelfEvident(entry.status)) {
    return null;
  }

  return entry.status === InAppAgentRunStatus.FAILED
    ? "failed-unread"
    : "done-unread";
}

export type InAppAgentActivityByConversationId = Map<
  string,
  { state: InAppAgentActivityState; entry: InAppAgentActivityEntry }
>;

export function getInAppAgentActivityByConversationId(
  ledger: InAppAgentActivityLedger,
): InAppAgentActivityByConversationId {
  const byConversationId = new Map<
    string,
    { state: InAppAgentActivityState; entry: InAppAgentActivityEntry }
  >();

  for (const [conversationId, entry] of Object.entries(ledger?.entries ?? {})) {
    const state = getInAppAgentActivityState(entry);

    if (state) {
      byConversationId.set(conversationId, { state, entry });
    }
  }

  return byConversationId;
}

/**
 * Conversations still owed the user's attention. A run merely executing does
 * not count — the spinner on its row already says so, and a badge that ticks up
 * whenever the assistant is working would train the user to ignore it.
 */
export function getInAppAgentAttentionCount(
  ledger: InAppAgentActivityLedger,
): number {
  let count = 0;

  for (const { state } of getInAppAgentActivityByConversationId(
    ledger,
  ).values()) {
    if (state !== "running") {
      count += 1;
    }
  }

  return count;
}

/**
 * Runs whose outcome the client cannot know on its own. Only unsettled runs
 * qualify: a terminal run already has its verdict recorded, so re-asking would
 * spend the request budget on an answer we have.
 */
export function getInAppAgentTrackedRunIds(
  ledger: InAppAgentActivityLedger,
  limit: number,
): string[] {
  return Object.values(ledger?.entries ?? {})
    .filter((entry) => isUnsettledInAppAgentRunStatus(entry.status))
    .map((entry) => entry.runId)
    .slice(0, limit);
}
