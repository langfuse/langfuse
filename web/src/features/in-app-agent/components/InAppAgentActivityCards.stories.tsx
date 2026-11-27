import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  InAppAgentActivityCards,
  type InAppAgentActivityCard,
} from "./InAppAgentActivityCards";

const card = (
  overrides: Partial<InAppAgentActivityCard> &
    Pick<InAppAgentActivityCard, "activityKey" | "state">,
): InAppAgentActivityCard => ({
  conversationId: "conversation-1",
  runId: overrides.activityKey.split(":")[0] ?? "run-1",
  title: "Latency outliers",
  ...overrides,
});

const meta = preview.meta({
  component: InAppAgentActivityCards,
  args: {
    onOpen: fn(),
    onDismiss: fn(),
  },
});

export const ApprovalRequired = meta.story({
  args: {
    cards: [
      card({
        activityKey: "run-1:AWAITING_APPROVAL",
        state: "approval",
        title: "Create the eval dataset",
      }),
    ],
  },
});

export const Finished = meta.story({
  args: {
    cards: [card({ activityKey: "run-1:SUCCEEDED", state: "done-unread" })],
  },
});

export const Failed = meta.story({
  args: {
    cards: [
      card({
        activityKey: "run-1:FAILED",
        state: "failed-unread",
        title: "Score correlation",
      }),
    ],
  },
});

export const UntitledConversation = meta.story({
  args: {
    cards: [
      card({
        activityKey: "run-1:SUCCEEDED",
        state: "done-unread",
        title: null,
      }),
    ],
  },
});

/** Approvals sort to the top regardless of the order they arrived in. */
export const Stacked = meta.story({
  args: {
    cards: [
      card({
        conversationId: "conversation-1",
        activityKey: "run-1:SUCCEEDED",
        state: "done-unread",
        title: "Finished while away",
      }),
      card({
        conversationId: "conversation-2",
        activityKey: "run-2:AWAITING_APPROVAL",
        state: "approval",
        title: "Needs your approval",
      }),
      card({
        conversationId: "conversation-3",
        activityKey: "run-3:FAILED",
        state: "failed-unread",
        title: "Failed while away",
      }),
    ],
  },
});

export const OpensAndDismisses = meta.story({
  name: "(Test) Opens And Dismisses",
  args: {
    cards: [card({ activityKey: "run-1:SUCCEEDED", state: "done-unread" })],
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
