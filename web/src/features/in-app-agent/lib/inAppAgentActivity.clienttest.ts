// @vitest-environment node

import { describe, expect, it } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";

import {
  getInAppAgentActivityKey,
  getInAppAgentPendingNotificationCards,
  hasInFlightInAppAgentActivity,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationHandled,
  mergeInAppAgentReceipts,
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

/** One poll as the hook applies it: reconcile, then record what it returned. */
const sync = (
  receipts: InAppAgentActivityReceipts,
  conversations: InAppAgentActivityConversation[],
  visibleConversationId?: string | null,
) => {
  const reconciled = reconcileInAppAgentActivity({
    receipts,
    conversations,
    visibleConversationId,
  });

  return {
    ...reconciled,
    receipts: mergeInAppAgentReceipts(receipts, reconciled.acknowledgements),
  };
};

describe("in-app agent activity receipts", () => {
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

  it("keeps the activity poll alive only while a run is still executing", () => {
    expect(
      hasInFlightInAppAgentActivity([
        conversation(
          "parked",
          latestRun({
            id: "parked-run",
            status: InAppAgentRunStatus.AWAITING_APPROVAL,
          }),
        ),
      ]),
    ).toBe(false);
    expect(
      hasInFlightInAppAgentActivity([
        conversation(
          "queued",
          latestRun({ id: "queued-run", status: InAppAgentRunStatus.QUEUED }),
        ),
      ]),
    ).toBe(true);
    expect(
      hasInFlightInAppAgentActivity([
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
      ]),
    ).toBe(true);
  });
});
