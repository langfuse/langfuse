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
  parameters: {
    layout: "padded",
    a11y: {
      test: "error",
      config: {
        rules: [{ id: "color-contrast", enabled: false }],
      },
    },
  },
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

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByText(content)).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(content)).toBeVisible();
  },
});
