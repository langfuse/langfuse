import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";

import {
  getInAppAgentActivityReceiptsStorageKey,
  type InAppAgentActivityConversation,
} from "./inAppAgentActivity";
import { useInAppAgentActivity } from "./useInAppAgentActivity";

const PROJECT_ID = "project-1";
const USER_ID = "user-1";
const RECEIPTS_KEY = getInAppAgentActivityReceiptsStorageKey(
  PROJECT_ID,
  USER_ID,
);

const activityMocks = vi.hoisted(() => ({
  conversations: [] as unknown[],
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    inAppAgent: {
      listConversations: {
        useQuery: () => ({
          data: { conversations: activityMocks.conversations },
          refetch: vi.fn(() => Promise.resolve({ data: undefined })),
        }),
      },
    },
  },
}));

const conversation = (
  id: string,
  status: InAppAgentRunStatus,
  runId = `${id}-run`,
): InAppAgentActivityConversation => ({
  id,
  title: id,
  latestRun: { id: runId, status, errorCode: null, cancelRequested: false },
});

/** The tab under test. Badge attention is all the nav renders. */
function ActivityProbe({
  visibleConversationId,
}: {
  visibleConversationId: string | null;
}) {
  const activity = useInAppAgentActivity({
    projectId: PROJECT_ID,
    userId: USER_ID,
    enabled: true,
    visibleConversationId,
  });

  return <span data-testid="attention">{activity.attentionCount}</span>;
}

/** Receipts another tab already recorded in the shared ledger. */
function seedLedger(handled: Record<string, string>) {
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify({ v: 1, handled }));
}

function storedHandled(): Record<string, string> | undefined {
  const raw = localStorage.getItem(RECEIPTS_KEY);
  return raw
    ? (JSON.parse(raw) as { handled: Record<string, string> }).handled
    : undefined;
}

function attention(): string | null {
  return screen.getByTestId("attention").textContent;
}

describe("useInAppAgentActivity across tabs", () => {
  beforeEach(() => {
    localStorage.clear();
    activityMocks.conversations = [];
  });

  it("does not walk a read receipt back to the run it was looking at mid-flight", () => {
    seedLedger({ c1: "c1-run:SUCCEEDED" });
    // This tab's poll froze while the run was still working.
    activityMocks.conversations = [
      conversation("c1", InAppAgentRunStatus.RUNNING),
    ];

    const { rerender } = render(<ActivityProbe visibleConversationId="c1" />);

    expect(storedHandled()).toEqual({ c1: "c1-run:SUCCEEDED" });

    // Refetch lands and the user starts a new conversation, so nothing masks
    // the ledger any more: a receipt walked back here shows up as a badge.
    activityMocks.conversations = [
      conversation("c1", InAppAgentRunStatus.SUCCEEDED),
    ];
    rerender(<ActivityProbe visibleConversationId={null} />);

    expect(attention()).toBe("0");
  });

  it("does not delete receipts once its own conversation list has gone stale", () => {
    seedLedger({ c1: "c1-run:SUCCEEDED", c2: "c2-run:SUCCEEDED" });
    activityMocks.conversations = [
      conversation("c1", InAppAgentRunStatus.SUCCEEDED),
      conversation("c2", InAppAgentRunStatus.SUCCEEDED),
    ];

    const { rerender } = render(<ActivityProbe visibleConversationId={null} />);

    // The tab is backgrounded and stops polling, so its list drifts behind the
    // ledger it shares. Compaction is hygiene, so it must not run on it.
    activityMocks.conversations = [
      conversation("c2", InAppAgentRunStatus.SUCCEEDED),
    ];
    rerender(<ActivityProbe visibleConversationId={null} />);

    expect(storedHandled()).toEqual({
      c1: "c1-run:SUCCEEDED",
      c2: "c2-run:SUCCEEDED",
    });
  });
});
