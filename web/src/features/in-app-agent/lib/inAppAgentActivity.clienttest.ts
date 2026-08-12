import { describe, expect, it } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";

import {
  getInAppAgentActivityKey,
  getInAppAgentActivityReceiptsStorageKey,
  getInAppAgentDeliveredReceiptsStorageKey,
  getInAppAgentPendingNotificationCards,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationHandled,
  pruneInAppAgentDeliveredReceipts,
  reconcileInAppAgentActivity,
  type InAppAgentActivityConversation,
  type InAppAgentActivityReceipts,
  type InAppAgentConversationLatestRun,
} from "./inAppAgentActivity";

const latestRun = (
  overrides: Partial<InAppAgentConversationLatestRun> &
    Pick<InAppAgentConversationLatestRun, "id" | "status">,
): InAppAgentConversationLatestRun => ({
  errorCode: null,
  cancelRequested: false,
  ...overrides,
});

const conversation = (
  id: string,
  run: InAppAgentConversationLatestRun | null,
  title: string | null = id,
): InAppAgentActivityConversation => ({
  id,
  title,
  latestRun: run,
});

const sync = (
  receipts: InAppAgentActivityReceipts,
  conversations: InAppAgentActivityConversation[],
  visibleConversationId?: string | null,
) =>
  reconcileInAppAgentActivity({
    receipts,
    conversations,
    visibleConversationId,
  });

describe("in-app agent activity receipts", () => {
  it("scopes ledger storage keys to project and user", () => {
    expect(getInAppAgentActivityReceiptsStorageKey("project-1", "user-a")).toBe(
      "langfuse-in-app-agent-activity:v1:project-1:user-a",
    );
    expect(
      getInAppAgentDeliveredReceiptsStorageKey("project-1", "user-a"),
    ).toBe("langfuse-in-app-agent-delivered:v1:project-1:user-a");
    expect(
      getInAppAgentActivityReceiptsStorageKey("project-1", "user-a"),
    ).not.toBe(getInAppAgentActivityReceiptsStorageKey("project-1", "user-b"));
  });

  it("baselines history, then treats status changes as unread attention", () => {
    const first = sync(null, [
      conversation(
        "old",
        latestRun({ id: "old-run", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
      conversation(
        "live",
        latestRun({ id: "live-run", status: InAppAgentRunStatus.RUNNING }),
      ),
      conversation(
        "parked",
        latestRun({
          id: "parked-run",
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        }),
      ),
    ]);

    // Existing terminals and approvals are quiet after baseline…
    expect(first.activityByConversationId.get("old")).toBeUndefined();
    expect(first.activityByConversationId.get("parked")).toMatchObject({
      state: "approval",
      needsAttention: false,
    });
    expect(first.attentionCount).toBe(0);
    // …while an in-flight run still shows in the list.
    expect(first.activityByConversationId.get("live")?.state).toBe("running");

    const afterCompletion = sync(first.receipts, [
      conversation(
        "old",
        latestRun({ id: "old-run", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
      conversation(
        "live",
        latestRun({ id: "live-run", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
      conversation(
        "parked",
        latestRun({
          id: "parked-run",
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        }),
      ),
    ]);

    expect(afterCompletion.activityByConversationId.get("live")).toMatchObject({
      state: "done-unread",
      needsAttention: true,
    });
    expect(afterCompletion.attentionCount).toBe(1);
  });

  it("clears badge attention when seen but keeps list approval status", () => {
    const running = sync(null, [
      conversation(
        "approve",
        latestRun({ id: "approve-run", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);

    const needsApproval = sync(running.receipts, [
      conversation(
        "approve",
        latestRun({
          id: "approve-run",
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        }),
      ),
    ]);

    expect(needsApproval.activityByConversationId.get("approve")).toMatchObject(
      {
        state: "approval",
        needsAttention: true,
      },
    );
    expect(needsApproval.attentionCount).toBe(1);
    expect(
      getInAppAgentPendingNotificationCards({
        activityByConversationId: needsApproval.activityByConversationId,
        delivered: null,
      }),
    ).toHaveLength(1);

    const seen = sync(
      needsApproval.receipts,
      [
        conversation(
          "approve",
          latestRun({
            id: "approve-run",
            status: InAppAgentRunStatus.AWAITING_APPROVAL,
          }),
        ),
      ],
      "approve",
    );

    expect(seen.activityByConversationId.get("approve")).toMatchObject({
      state: "approval",
      needsAttention: false,
    });
    expect(seen.attentionCount).toBe(0);
    expect(
      getInAppAgentPendingNotificationCards({
        activityByConversationId: seen.activityByConversationId,
        delivered: null,
      }),
    ).toEqual([]);
  });

  it("keeps delivered toasts independent from unread receipts", () => {
    const unread = sync(null, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);
    const finished = sync(unread.receipts, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.SUCCEEDED }),
        "Latency",
      ),
    ]);

    const activityKey = getInAppAgentActivityKey({
      id: "run-1",
      status: InAppAgentRunStatus.SUCCEEDED,
    });
    expect(
      getInAppAgentPendingNotificationCards({
        activityByConversationId: finished.activityByConversationId,
        delivered: null,
      }),
    ).toEqual([
      expect.objectContaining({
        conversationId: "c1",
        activityKey,
        state: "done-unread",
      }),
    ]);

    const delivered = markInAppAgentActivityDelivered(null, [
      { conversationId: "c1", activityKey },
    ]);
    expect(
      getInAppAgentPendingNotificationCards({
        activityByConversationId: finished.activityByConversationId,
        delivered,
      }),
    ).toEqual([]);
    // Dismissing the toast does not clear badge attention.
    expect(finished.activityByConversationId.get("c1")).toMatchObject({
      state: "done-unread",
      needsAttention: true,
    });
    expect(finished.attentionCount).toBe(1);

    const handled = markInAppAgentConversationHandled(
      finished.receipts,
      "c1",
      activityKey,
    );
    const afterOpen = sync(handled, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
    ]);
    expect(afterOpen.activityByConversationId.get("c1")).toBeUndefined();
    expect(afterOpen.attentionCount).toBe(0);
  });

  it("keeps a read receipt when a stale snapshot still reports the run in flight", () => {
    const running = sync(null, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);
    const finished = sync(running.receipts, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
    ]);
    expect(finished.attentionCount).toBe(1);

    const read = markInAppAgentConversationHandled(
      finished.receipts,
      "c1",
      getInAppAgentActivityKey({
        id: "run-1",
        status: InAppAgentRunStatus.SUCCEEDED,
      }),
    );

    // A background tab stops polling, so it folds a pre-completion snapshot into
    // the ledger it shares with the tab the user is looking at.
    const stale = sync(read, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);
    expect(stale.receipts?.handled.c1).toBe("run-1:SUCCEEDED");

    // Whatever the stale tab wrote decides what the up-to-date tab badges next.
    const afterStale = sync(stale.receipts, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
    ]);
    expect(afterStale.attentionCount).toBe(0);
  });

  it("prunes receipt keys for conversations that left the activity window", () => {
    const seeded = sync(null, [
      conversation(
        "keep",
        latestRun({ id: "keep-run", status: InAppAgentRunStatus.RUNNING }),
      ),
      conversation(
        "drop",
        latestRun({ id: "drop-run", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);

    expect(seeded.receipts?.handled).toMatchObject({
      keep: "keep-run:RUNNING",
      drop: "drop-run:RUNNING",
    });

    const afterDrop = sync(seeded.receipts, [
      conversation(
        "keep",
        latestRun({ id: "keep-run", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);

    expect(afterDrop.receipts?.handled).toEqual({
      keep: "keep-run:RUNNING",
    });

    const delivered = markInAppAgentActivityDelivered(null, [
      {
        conversationId: "drop",
        activityKey: "drop-run:SUCCEEDED",
      },
      {
        conversationId: "keep",
        activityKey: "keep-run:SUCCEEDED",
      },
    ]);
    expect(
      pruneInAppAgentDeliveredReceipts(delivered, new Set(["keep"]))?.delivered,
    ).toEqual({
      keep: "keep-run:SUCCEEDED",
    });
  });
});
