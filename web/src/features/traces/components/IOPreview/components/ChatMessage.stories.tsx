import preview from "../../../../../../.storybook/preview";
import { expect, waitFor } from "storybook/test";
import { ChatMessage } from "./ChatMessage";
import { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

const meta = preview.meta({
  component: ChatMessage,
  args: {
    shouldRenderMarkdown: true,
    currentView: "pretty",
    title: "assistant",
  },
});

export const HeaderControlsOnFocus = meta.story({
  name: "(Test) Reveals Header Controls On Focus",
  args: {
    message: ChatMlMessageSchema.parse({
      role: "assistant",
      content: "Hover this message to reveal its header controls.",
    }),
  },
  play: async ({ canvas }) => {
    const copyButton = canvas.getByRole("button", {
      name: "Copy to clipboard",
    });
    await waitFor(() => expect(copyButton).not.toBeVisible());
    copyButton.focus();
    await waitFor(() => expect(copyButton).toBeVisible());
  },
});
