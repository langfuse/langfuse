import { describe, expect, it } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";

import {
  getInAppAgentActivityKey,
  getInAppAgentPendingNotificationCards,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationHandled,
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
  it("baselines first-fetch history as handled while keeping later terminal unread", () => {
    const first = sync(null, [
      conversation(
        "old",
        latestRun({ id: "old-run", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
      conversation(
        "live",
        latestRun({ id: "live-run", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);

    expect(first.activityByConversationId.get("old")).toBeUndefined();
    expect(first.activityByConversationId.get("live")?.state).toBe("running");
    expect(first.attentionCount).toBe(0);

    const afterCompletion = sync(first.receipts, [
      conversation(
        "old",
        latestRun({ id: "old-run", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
      conversation(
        "live",
        latestRun({ id: "live-run", status: InAppAgentRunStatus.SUCCEEDED }),
      ),
    ]);

    expect(afterCompletion.activityByConversationId.get("live")?.state).toBe(
      "done-unread",
    );
    expect(afterCompletion.attentionCount).toBe(1);
  });

  it("marks a visible terminal result handled without clearing approval attention", () => {
    const seeded = sync(null, [
      conversation(
        "done",
        latestRun({ id: "done-run", status: InAppAgentRunStatus.RUNNING }),
      ),
      conversation(
        "approve",
        latestRun({
          id: "approve-run",
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        }),
      ),
    ]);

    const terminal = sync(
      seeded.receipts,
      [
        conversation(
          "done",
          latestRun({ id: "done-run", status: InAppAgentRunStatus.FAILED }),
        ),
        conversation(
          "approve",
          latestRun({
            id: "approve-run",
            status: InAppAgentRunStatus.AWAITING_APPROVAL,
          }),
        ),
      ],
      "done",
    );

    expect(terminal.activityByConversationId.get("done")).toBeUndefined();
    expect(terminal.activityByConversationId.get("approve")?.state).toBe(
      "approval",
    );

    const openedApproval = markInAppAgentConversationHandled(
      terminal.receipts,
      "approve",
      getInAppAgentActivityKey({
        id: "approve-run",
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
      }),
    );
    const stillNeedsApproval = sync(openedApproval, [
      conversation(
        "approve",
        latestRun({
          id: "approve-run",
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        }),
      ),
    ]);

    expect(
      stillNeedsApproval.activityByConversationId.get("approve")?.state,
    ).toBe("approval");
  });

  it("auto-advances cancelled activity and returns the same receipts on a no-op", () => {
    const running = sync(null, [
      conversation(
        "busy",
        latestRun({ id: "busy-run", status: InAppAgentRunStatus.RUNNING }),
      ),
    ]);

    const cancelled = sync(running.receipts, [
      conversation(
        "busy",
        latestRun({ id: "busy-run", status: InAppAgentRunStatus.CANCELLED }),
      ),
    ]);

    expect(cancelled.activityByConversationId.get("busy")).toBeUndefined();
    expect(cancelled.attentionCount).toBe(0);

    const again = sync(cancelled.receipts, [
      conversation(
        "busy",
        latestRun({ id: "busy-run", status: InAppAgentRunStatus.CANCELLED }),
      ),
    ]);
    expect(again.receipts).toBe(cancelled.receipts);
  });

  it("keeps delivered cards independent from unread receipts", () => {
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
    const pendingBefore = getInAppAgentPendingNotificationCards({
      activityByConversationId: finished.activityByConversationId,
      delivered: null,
    });
    expect(pendingBefore).toEqual([
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
    expect(finished.activityByConversationId.get("c1")?.state).toBe(
      "done-unread",
    );

    const nextStatusKey = getInAppAgentActivityKey({
      id: "run-1",
      status: InAppAgentRunStatus.FAILED,
    });
    const laterFailure = sync(finished.receipts, [
      conversation(
        "c1",
        latestRun({ id: "run-1", status: InAppAgentRunStatus.FAILED }),
      ),
    ]);
    expect(
      getInAppAgentPendingNotificationCards({
        activityByConversationId: laterFailure.activityByConversationId,
        delivered,
      }),
    ).toEqual([
      expect.objectContaining({
        conversationId: "c1",
        activityKey: nextStatusKey,
        state: "failed-unread",
      }),
    ]);
  });
});
