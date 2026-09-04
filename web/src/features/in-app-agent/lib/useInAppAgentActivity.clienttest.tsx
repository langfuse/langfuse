import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";

import {
  getInAppAgentActivityReceiptsStorageKey,
  getInAppAgentDeliveredReceiptsStorageKey,
  type InAppAgentActivityConversation,
} from "./inAppAgentActivity";
import { useInAppAgentActivity } from "./useInAppAgentActivity";

const PROJECT_ID = "project-1";
const USER_ID = "user-1";
const RECEIPTS_KEY = getInAppAgentActivityReceiptsStorageKey(
  PROJECT_ID,
  USER_ID,
);
const DELIVERED_KEY = getInAppAgentDeliveredReceiptsStorageKey(
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

/** Receipts another tab already recorded in the ledgers every tab shares. */
function seedLedgers(keys: Record<string, string>) {
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify({ v: 1, handled: keys }));
  localStorage.setItem(
    DELIVERED_KEY,
    JSON.stringify({ v: 1, delivered: keys }),
  );
}

function storedKeys(
  storageKey: string,
  field: "handled" | "delivered",
): Record<string, string> | undefined {
  const raw = localStorage.getItem(storageKey);
  return raw
    ? (JSON.parse(raw) as Record<typeof field, Record<string, string>>)[field]
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
    seedLedgers({ c1: "c1-run:SUCCEEDED" });
    // This tab's poll froze while the run was still working.
    activityMocks.conversations = [
      conversation("c1", InAppAgentRunStatus.RUNNING),
    ];

    const { rerender } = render(<ActivityProbe visibleConversationId="c1" />);

    expect(storedKeys(RECEIPTS_KEY, "handled")).toEqual({
      c1: "c1-run:SUCCEEDED",
    });

    // Refetch lands and the user starts a new conversation, so nothing masks
    // the ledger any more: a receipt walked back here shows up as a badge.
    activityMocks.conversations = [
      conversation("c1", InAppAgentRunStatus.SUCCEEDED),
    ];
    rerender(<ActivityProbe visibleConversationId={null} />);

    expect(attention()).toBe("0");
  });

  it("compacts against the list it fetched, then never again", () => {
    seedLedgers({
      c1: "c1-run:SUCCEEDED",
      c2: "c2-run:SUCCEEDED",
      evicted: "evicted-run:SUCCEEDED",
    });
    activityMocks.conversations = [
      conversation("c1", InAppAgentRunStatus.SUCCEEDED),
      conversation("c2", InAppAgentRunStatus.SUCCEEDED),
    ];

    const { rerender } = render(<ActivityProbe visibleConversationId={null} />);

    // Conversations that left the activity window are storage the ledgers no
    // longer need, so the first fetch drops them.
    expect(storedKeys(RECEIPTS_KEY, "handled")).toEqual({
      c1: "c1-run:SUCCEEDED",
      c2: "c2-run:SUCCEEDED",
    });
    expect(storedKeys(DELIVERED_KEY, "delivered")).toEqual({
      c1: "c1-run:SUCCEEDED",
      c2: "c2-run:SUCCEEDED",
    });

    // The tab is backgrounded and stops polling, so its list drifts behind the
    // ledgers it shares. Deleting is what compaction does, so it runs once.
    activityMocks.conversations = [
      conversation("c2", InAppAgentRunStatus.SUCCEEDED),
    ];
    rerender(<ActivityProbe visibleConversationId={null} />);

    expect(storedKeys(RECEIPTS_KEY, "handled")).toEqual({
      c1: "c1-run:SUCCEEDED",
      c2: "c2-run:SUCCEEDED",
    });
  });
});
