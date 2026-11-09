import { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { expect, fn } from "storybook/test";
import preview from "@/.storybook/preview";
import { SessionRedesignBanner } from "@/src/features/sessions/SessionRedesignBanner";

const capture = fn<PostHog["capture"]>();
const client = new PostHog();
client.capture = capture;

const meta = preview.meta({
  component: SessionRedesignBanner,
  args: { onDismiss: fn() },
  decorators: [
    (Story) => (
      <PostHogProvider client={client}>
        <Story />
      </PostHogProvider>
    ),
  ],
  beforeEach: () => {
    capture.mockClear();
  },
});

export const Default = meta.story({});

export const TestLinkClicks = meta.story({
  name: "(Test) Link clicks",
  play: async ({ canvas, userEvent }) => {
    const learnMore = canvas.getByRole("link", { name: "Learn more" });
    await expect(learnMore).toHaveAttribute(
      "href",
      "https://langfuse.com/changelog/2026-10-13-redesigned-session-view",
    );
    await userEvent.click(learnMore);
    await expect(capture).toHaveBeenCalledWith(
      "session_detail:announcement_learn_more_click",
      undefined,
      undefined,
    );

    const feedback = canvas.getByRole("link", { name: "Give feedback" });
    await expect(feedback).toHaveAttribute(
      "href",
      "https://github.com/orgs/langfuse/discussions/18687",
    );
    await userEvent.click(feedback);
    await expect(capture).toHaveBeenCalledWith(
      "session_detail:announcement_feedback_click",
      undefined,
      undefined,
    );
  },
});

export const TestDismissal = meta.story({
  name: "(Test) Dismissal",
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Dismiss redesigned sessions view banner",
      }),
    );
    await expect(args.onDismiss).toHaveBeenCalledOnce();
    await expect(capture).toHaveBeenCalledWith(
      "session_detail:announcement_dismiss",
      undefined,
      undefined,
    );
  },
});
