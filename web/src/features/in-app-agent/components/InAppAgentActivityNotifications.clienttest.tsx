import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InAppAgentActivityNotifications } from "./InAppAgentActivityNotifications";
import type { InAppAgentActivityCard } from "./InAppAgentActivityCards";

vi.mock("@/src/components/ui/layer", () => ({
  Layer: ({ children }: { children?: unknown }) => children,
}));

const card = (
  overrides: Partial<InAppAgentActivityCard> &
    Pick<InAppAgentActivityCard, "conversationId" | "activityKey" | "state">,
): InAppAgentActivityCard => ({
  runId: overrides.activityKey.split(":")[0] ?? "run",
  title: overrides.title ?? overrides.conversationId,
  ...overrides,
});

describe("InAppAgentActivityNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires each result on its own timer and does not deliver capped cards", () => {
    const onDelivered = vi.fn();
    const onOpenConversation = vi.fn();

    const { rerender } = render(
      <InAppAgentActivityNotifications
        notifications={[
          card({
            conversationId: "c1",
            activityKey: "run-1:SUCCEEDED",
            state: "done-unread",
            title: "First",
          }),
        ]}
        onDelivered={onDelivered}
        onOpenConversation={onOpenConversation}
      />,
    );

    expect(screen.getByText("First")).toBeInTheDocument();

    rerender(
      <InAppAgentActivityNotifications
        notifications={[
          card({
            conversationId: "c1",
            activityKey: "run-1:SUCCEEDED",
            state: "done-unread",
            title: "First",
          }),
          card({
            conversationId: "c2",
            activityKey: "run-2:SUCCEEDED",
            state: "done-unread",
            title: "Second",
          }),
          card({
            conversationId: "c3",
            activityKey: "run-3:SUCCEEDED",
            state: "done-unread",
            title: "Third",
          }),
          card({
            conversationId: "c4",
            activityKey: "run-4:SUCCEEDED",
            state: "done-unread",
            title: "Fourth",
          }),
        ]}
        onDelivered={onDelivered}
        onOpenConversation={onOpenConversation}
      />,
    );

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.queryByText("Fourth")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(onDelivered).toHaveBeenCalledWith([
      {
        conversationId: "c1",
        activityKey: "run-1:SUCCEEDED",
      },
    ]);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getByText("Fourth")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    const deliveredKeys = onDelivered.mock.calls.flatMap((call) =>
      call[0].map((entry: { activityKey: string }) => entry.activityKey),
    );
    expect(deliveredKeys).toEqual(
      expect.arrayContaining([
        "run-1:SUCCEEDED",
        "run-2:SUCCEEDED",
        "run-3:SUCCEEDED",
        "run-4:SUCCEEDED",
      ]),
    );
    expect(deliveredKeys).toHaveLength(4);
  });
});
