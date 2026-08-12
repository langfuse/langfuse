import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { InAppAgentActivityCards } from "./InAppAgentActivityCards";

const meta = preview.meta({
  component: InAppAgentActivityCards,
  args: {
    onOpen: fn(),
    onDismiss: fn(),
    cards: [],
  },
});

export const ApprovalRequired = meta.story({
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:AWAITING_APPROVAL",
        runId: "run-1",
        title: "Create the eval dataset",
        state: "approval",
      },
    ],
  },
});

export const Finished = meta.story({
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:SUCCEEDED",
        runId: "run-1",
        title: "Latency outliers",
        state: "done-unread",
      },
    ],
  },
});

export const Failed = meta.story({
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:FAILED",
        runId: "run-1",
        title: "Score correlation",
        state: "failed-unread",
      },
    ],
  },
});

export const UntitledConversation = meta.story({
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:SUCCEEDED",
        runId: "run-1",
        title: null,
        state: "done-unread",
      },
    ],
  },
});

/** Approvals sort to the top regardless of the order they arrived in. */
export const Stacked = meta.story({
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:SUCCEEDED",
        runId: "run-1",
        title: "Finished while away",
        state: "done-unread",
      },
      {
        conversationId: "conversation-2",
        activityKey: "run-2:AWAITING_APPROVAL",
        runId: "run-2",
        title: "Needs your approval",
        state: "approval",
      },
      {
        conversationId: "conversation-3",
        activityKey: "run-3:FAILED",
        runId: "run-3",
        title: "Failed while away",
        state: "failed-unread",
      },
    ],
  },
});

export const Empty = meta.story({
  args: { cards: [] },
});

export const CapsTheStack = meta.story({
  name: "(Test) Caps The Stack And Keeps The Approval",
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:SUCCEEDED",
        runId: "run-1",
        title: "Oldest result",
        state: "done-unread",
      },
      {
        conversationId: "conversation-2",
        activityKey: "run-2:SUCCEEDED",
        runId: "run-2",
        title: "Second result",
        state: "done-unread",
      },
      {
        conversationId: "conversation-3",
        activityKey: "run-3:SUCCEEDED",
        runId: "run-3",
        title: "Third result",
        state: "done-unread",
      },
      {
        conversationId: "conversation-4",
        activityKey: "run-4:AWAITING_APPROVAL",
        runId: "run-4",
        title: "Waiting on you",
        state: "approval",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Four in, three out — and the approval is never the one dropped.
    await expect(canvas.getAllByRole("status")).toHaveLength(3);
    await expect(canvas.getByText("Waiting on you")).toBeVisible();
    await expect(canvas.queryByText("Third result")).not.toBeInTheDocument();
  },
});

export const OpensAndDismisses = meta.story({
  name: "(Test) Opens And Dismisses",
  args: {
    cards: [
      {
        conversationId: "conversation-1",
        activityKey: "run-1:SUCCEEDED",
        runId: "run-1",
        title: "Latency outliers",
        state: "done-unread",
      },
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByText("Latency outliers"));
    await expect(args.onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conversation-1" }),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ activityKey: "run-1:SUCCEEDED" }),
    );
  },
});
