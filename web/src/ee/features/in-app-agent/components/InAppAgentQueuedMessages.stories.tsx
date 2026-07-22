import { useState, type ComponentProps } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import {
  InAppAgentQueuedMessages,
  type InAppAgentQueuedMessageItem,
} from "./InAppAgentQueuedMessages";

const messages: InAppAgentQueuedMessageItem[] = [
  { id: "queued-1", content: "Compare this against the previous week." },
  {
    id: "queued-2",
    content:
      "Then break the result down by model.\nCall out any regressions that are larger than 10%.",
  },
];

const meta = preview.meta({
  component: InAppAgentQueuedMessages,
  args: {
    messages,
    onEdit: fn(),
    onDelete: fn(),
    onReorder: fn(),
  },
});

export const QueuedFollowUps = meta.story({
  render: (args) => <ReorderableQueueStory {...args} />,
});

export const Collapsed = meta.story({
  args: { defaultExpanded: false },
  render: (args) => <ReorderableQueueStory {...args} />,
});

function ReorderableQueueStory(
  args: ComponentProps<typeof InAppAgentQueuedMessages>,
) {
  const [queuedMessages, setQueuedMessages] = useState(() =>
    Array.from(args.messages),
  );
  return (
    <InAppAgentQueuedMessages
      {...args}
      messages={queuedMessages}
      onDelete={(messageId) => {
        args.onDelete(messageId);
        setQueuedMessages((current) =>
          current.filter(({ id }) => id !== messageId),
        );
      }}
      onReorder={(messageId, targetMessageId) => {
        args.onReorder?.(messageId, targetMessageId);
        setQueuedMessages((current) => {
          const fromIndex = current.findIndex(({ id }) => id === messageId);
          const toIndex = current.findIndex(({ id }) => id === targetMessageId);
          return fromIndex < 0 || toIndex < 0
            ? current
            : arrayMove(current, fromIndex, toIndex);
        });
      }}
    />
  );
}

export const TestEditsAndDeletesFollowUps = meta.story({
  name: "(Test) Edits And Deletes Follow-Ups",
  render: (args) => <ReorderableQueueStory {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit queued message 1" }),
    );
    await expect(args.onEdit).toHaveBeenCalledWith("queued-1");

    await userEvent.click(
      canvas.getByRole("button", { name: "Delete queued message 2" }),
    );
    await expect(args.onDelete).toHaveBeenCalledWith("queued-2");
  },
});
