import { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayLaunchDialog } from "./GatewayLaunchDialog";

const organizationId = "org-acme-robotics";

const capture = fn<PostHog["capture"]>();
const client = new PostHog();
client.capture = capture;

const meta = preview.meta({
  component: GatewayLaunchDialog,
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

export const Setup = meta.story({
  args: {
    organizationId,
    state: "setup",
    open: true,
    onOpenChange: fn(),
  },
});

export const AskAdmin = meta.story({
  args: {
    organizationId,
    state: "ask-admin",
    open: true,
    onOpenChange: fn(),
  },
});

export const GetApiKey = meta.story({
  args: {
    organizationId,
    state: "get-key",
    open: true,
    onOpenChange: fn(),
  },
});
