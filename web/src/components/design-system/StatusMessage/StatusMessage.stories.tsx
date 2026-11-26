import preview from "@/.storybook/preview";
import { expect } from "storybook/test";
import { StatusMessage } from "./StatusMessage";

const meta = preview.meta({
  component: StatusMessage,
  args: { size: "default" as const },
});
export default meta;

export const Error = meta.story({
  args: {
    level: "ERROR",
    message: "Upstream model request timed out after 30 seconds.",
  },
});

export const Warning = meta.story({
  args: {
    level: "WARNING",
    message: "The observation completed with a recoverable warning.",
  },
});

export const Default = meta.story({
  args: {
    level: "DEFAULT",
    message: "The observation completed with additional status details.",
  },
});

export const Debug = meta.story({
  args: {
    level: "DEBUG",
    message: "Detailed diagnostic information for this observation.",
  },
});

export const Compact = Error.extend({ args: { size: "compact" } });
export const DarkError = Error.extend({ globals: { theme: "dark" } });
export const DarkWarning = Warning.extend({ globals: { theme: "dark" } });

export const MultilineMessage = Error.extend({
  name: "(Test) Preserves Multiline Status Message",
  args: {
    message:
      "Request failed.\nRetry after 30 seconds.\nContact support if the problem persists.",
  },
  play: async ({ canvas, args }) => {
    const message = canvas.getByText(/Request failed/);
    await expect(message).toBeVisible();
    await expect(message.textContent).toBe(args.message);
  },
});
