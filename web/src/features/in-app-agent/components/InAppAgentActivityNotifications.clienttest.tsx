import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("expires results and approvals on the same timer and does not deliver capped cards", () => {
    const onDelivered = vi.fn();
    const onOpenConversation = vi.fn();

    const { rerender } = render(
      <InAppAgentActivityNotifications
        notifications={[
          card({
            conversationId: "c1",
            activityKey: "run-1:AWAITING_APPROVAL",
            state: "approval",
            title: "Needs you",
          }),
        ]}
        onDelivered={onDelivered}
        onOpenConversation={onOpenConversation}
      />,
    );

    expect(screen.getByText("Needs you")).toBeInTheDocument();

    rerender(
      <InAppAgentActivityNotifications
        notifications={[
          card({
            conversationId: "c1",
            activityKey: "run-1:AWAITING_APPROVAL",
            state: "approval",
            title: "Needs you",
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

    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.queryByText("Fourth")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(onDelivered).toHaveBeenCalledWith([
      {
        conversationId: "c1",
        activityKey: "run-1:AWAITING_APPROVAL",
      },
    ]);
    expect(screen.queryByText("Needs you")).not.toBeInTheDocument();
    expect(screen.getByText("Fourth")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    const deliveredKeys = onDelivered.mock.calls.flatMap((call) =>
      call[0].map((entry: { activityKey: string }) => entry.activityKey),
    );
    expect(deliveredKeys).toEqual(
      expect.arrayContaining([
        "run-1:AWAITING_APPROVAL",
        "run-2:SUCCEEDED",
        "run-3:SUCCEEDED",
        "run-4:SUCCEEDED",
      ]),
    );
    expect(deliveredKeys).toHaveLength(4);
  });

  it("delivers a previously shown card when a higher-priority arrival evicts it", () => {
    const onDelivered = vi.fn();
    const onOpenConversation = vi.fn();

    const doneCards = [
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
    ];

    const { rerender } = render(
      <InAppAgentActivityNotifications
        notifications={doneCards}
        onDelivered={onDelivered}
        onOpenConversation={onOpenConversation}
      />,
    );

    expect(screen.getByText("Third")).toBeInTheDocument();

    const withApproval = [
      ...doneCards,
      card({
        conversationId: "c4",
        activityKey: "run-4:AWAITING_APPROVAL",
        state: "approval",
        title: "Needs you",
      }),
    ];

    rerender(
      <InAppAgentActivityNotifications
        notifications={withApproval}
        onDelivered={onDelivered}
        onOpenConversation={onOpenConversation}
      />,
    );

    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.queryByText("Third")).not.toBeInTheDocument();
    expect(onDelivered).toHaveBeenCalledWith([
      {
        conversationId: "c3",
        activityKey: "run-3:SUCCEEDED",
      },
    ]);

    const approvalCard = screen
      .getByText("Needs you")
      .closest('[role="status"]');
    expect(approvalCard).toBeInstanceOf(HTMLElement);
    fireEvent.click(
      within(approvalCard as HTMLElement).getByRole("button", {
        name: "Dismiss",
      }),
    );

    expect(screen.queryByText("Needs you")).not.toBeInTheDocument();
    expect(screen.queryByText("Third")).not.toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
