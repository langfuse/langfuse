import { getRouter } from "@storybook/nextjs-vite/router.mock";
import { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { expect, fn, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayLaunchDialog } from "./GatewayLaunchDialog";

const acmeRobotics = {
  organizationId: "org-acme-robotics",
  organizationName: "Acme Robotics",
  canManage: true,
};
const acmeResearch = {
  organizationId: "org-acme-research",
  organizationName: "Acme Research",
  canManage: true,
};

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

export const SetupOneOrg = meta.story({
  args: {
    organizationId: acmeRobotics.organizationId,
    state: "setup",
    setupOptions: [acmeRobotics],
    open: true,
    onOpenChange: fn(),
  },
});

export const SetupSeveralOrgs = meta.story({
  args: {
    organizationId: acmeRobotics.organizationId,
    state: "setup",
    setupOptions: [acmeRobotics, acmeResearch],
    open: true,
    onOpenChange: fn(),
  },
});

export const AskAdmin = meta.story({
  args: {
    organizationId: acmeRobotics.organizationId,
    state: "ask-admin",
    setupOptions: [],
    open: true,
    onOpenChange: fn(),
  },
});

export const GetApiKey = meta.story({
  args: {
    organizationId: acmeRobotics.organizationId,
    state: "get-key",
    setupOptions: [],
    open: true,
    onOpenChange: fn(),
  },
});

export const PicksOrg = SetupSeveralOrgs.extend({
  name: "(Test) Picks Org",
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Set up gateway" }));
    await userEvent.click(
      body.getByRole("menuitem", { name: "Acme Research" }),
    );

    await expect(capture).toHaveBeenCalledWith(
      "ai_gateway_launch:dialog_setup_clicked",
      undefined,
      undefined,
    );
    await expect(getRouter().push).toHaveBeenCalledWith(
      "/organization/org-acme-research/settings/ai-gateway",
    );
  },
});
