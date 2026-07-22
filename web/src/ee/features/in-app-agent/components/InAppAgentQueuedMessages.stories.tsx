import { useState, type ComponentProps } from "react";
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
  },
});

export const QueuedFollowUps = meta.story({});

export const Collapsed = meta.story({
  args: { defaultExpanded: false },
});

function EditableQueueStory(
  args: ComponentProps<typeof InAppAgentQueuedMessages>,
) {
  const [queuedMessages, setQueuedMessages] = useState(args.messages);
  return (
    <InAppAgentQueuedMessages
      {...args}
      messages={queuedMessages}
      onEdit={(messageId, content) => {
        args.onEdit(messageId, content);
        setQueuedMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, content } : message,
          ),
        );
      }}
      onDelete={(messageId) => {
        args.onDelete(messageId);
        setQueuedMessages((current) =>
          current.filter((message) => message.id !== messageId),
        );
      }}
    />
  );
}

export const TestEditsAndDeletesFollowUps = meta.story({
  name: "(Test) Edits And Deletes Follow-Ups",
  render: (args) => <EditableQueueStory {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit queued message 1" }),
    );
    const firstEditor = canvas.getByRole("textbox", {
      name: "Edit queued message 1",
    });
    await userEvent.clear(firstEditor);
    await userEvent.type(firstEditor, "Edited with Save");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onEdit).toHaveBeenCalledWith(
      "queued-1",
      "Edited with Save",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit queued message 2" }),
    );
    const secondEditor = canvas.getByRole("textbox", {
      name: "Edit queued message 2",
    });
    await userEvent.type(secondEditor, "{enter}temporary line");
    await expect(secondEditor).toHaveValue(
      `${messages[1]?.content}\ntemporary line`,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onEdit).toHaveBeenCalledTimes(1);

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit queued message 1" }),
    );
    const keyboardEditor = canvas.getByRole("textbox", {
      name: "Edit queued message 1",
    });
    await userEvent.clear(keyboardEditor);
    await userEvent.type(keyboardEditor, "Saved from keyboard");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(args.onEdit).toHaveBeenLastCalledWith(
      "queued-1",
      "Saved from keyboard",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit queued message 2" }),
    );
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Delete queued message 2" }),
    );
    await expect(args.onDelete).toHaveBeenCalledWith("queued-2");
  },
});
