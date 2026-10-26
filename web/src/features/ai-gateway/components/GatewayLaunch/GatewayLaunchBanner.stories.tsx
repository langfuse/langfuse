import { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { expect, fn, waitFor, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayLaunchBanner } from "./GatewayLaunchBanner";

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
  component: GatewayLaunchBanner,
  decorators: [
    (Story) => (
      <PostHogProvider client={client}>
        <Story />
      </PostHogProvider>
    ),
  ],
  beforeEach: () => {
    capture.mockClear();
    // Dismissals persist in localStorage; every story load starts with the banner shown.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ai-gateway-launch:")) localStorage.removeItem(key);
    }
  },
});

export const Setup = meta.story({
  args: {
    userId: "user-maya",
    target: {
      organizationId: acmeRobotics.organizationId,
      state: "setup",
      setupOptions: [acmeRobotics],
    },
  },
});

export const SetupSeveralOrgs = meta.story({
  args: {
    userId: "user-maya",
    target: {
      organizationId: acmeRobotics.organizationId,
      state: "setup",
      setupOptions: [acmeRobotics, acmeResearch],
    },
  },
});

export const AskAdmin = meta.story({
  args: {
    userId: "user-priya",
    target: {
      organizationId: acmeRobotics.organizationId,
      state: "ask-admin",
      setupOptions: [],
    },
  },
});

export const GetApiKey = meta.story({
  args: {
    userId: "user-priya",
    target: {
      organizationId: acmeRobotics.organizationId,
      state: "get-key",
      setupOptions: [],
    },
  },
});

export const OpensOrgPicker = SetupSeveralOrgs.extend({
  name: "(Test) Opens Org Picker",
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Set up" }));
    await expect(capture).toHaveBeenCalledWith(
      "ai_gateway_launch:banner_cta_clicked",
      { state: "setup", orgCount: 2 },
      undefined,
    );

    await userEvent.click(body.getByRole("button", { name: "Set up gateway" }));
    // The dialog fades in, so wait until its menu is fully shown.
    await waitFor(async () => {
      await expect(
        body.getByRole("menuitem", { name: "Acme Robotics" }),
      ).toBeVisible();
      await expect(
        body.getByRole("menuitem", { name: "Acme Research" }),
      ).toBeVisible();
    });
  },
});
