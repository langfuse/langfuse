import preview from "@/.storybook/preview";
import { expect, userEvent, within } from "storybook/test";

import { SessionTimelineSystemMessage } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";

const systemPromptParts = [
  {
    type: "text" as const,
    text: "Answer using the product documentation and cite relevant sources.",
  },
];

const meta = preview.meta({
  component: SessionTimelineSystemMessage,
  args: { senderName: undefined },
  parameters: { layout: "padded", a11y: { test: "error" } },
});

export default meta;

export const SystemPrompt = meta.story({
  args: { parts: systemPromptParts },
});

export const ExpandSystemPrompt = meta.story({
  name: "(Test) Expands System Prompt",
  args: { parts: systemPromptParts },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const content = systemPromptParts[0].text;
    const trigger = canvas.getByRole("button", { name: "System prompt" });
    const initialLeft = trigger.getBoundingClientRect().left;

    await expect(trigger.closest(".ph-no-capture")).not.toHaveClass(
      "justify-center",
    );
    await expect(canvasElement.querySelector(".border-dashed")).toBeVisible();
    await expect(trigger).toHaveClass("font-normal");
    await expect(trigger).not.toHaveClass("font-bold");
    await expect(canvas.queryByText(content)).not.toBeInTheDocument();
    await userEvent.click(trigger);
    const systemPrompt = canvas.getByText(content);
    await expect(systemPrompt).toBeVisible();
    await expect(systemPrompt.closest(".border-l")).toBeNull();
    await expect(systemPrompt.getBoundingClientRect().left).toBe(initialLeft);
    await expect(trigger.getBoundingClientRect().left).toBe(initialLeft);
  },
});
