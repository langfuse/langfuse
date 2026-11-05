import type { ComponentProps } from "react";
import { expect, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { OrganizationDropdownMenu } from "./OrganizationDropdownMenu";

type Organization = Extract<
  ComponentProps<typeof OrganizationDropdownMenu>,
  { state: "loaded" }
>["organizations"][number];

const createOrganization = (id: string, name: string): Organization => ({
  id,
  name,
  role: "OWNER",
  cloudConfig: undefined,
  plan: "cloud:hobby",
  metadata: {},
  aiFeaturesEnabled: false,
  aiTelemetryEnabled: false,
  projects: [],
});

const organizations = [
  createOrganization("org-acme", "Acme Inc."),
  createOrganization("org-globex", "Globex Corporation"),
  createOrganization("org-initech", "Initech"),
  createOrganization(
    "org-long-name",
    "An organization name that is too long to fit in the menu",
  ),
];

const meta = preview.meta({
  component: OrganizationDropdownMenu,
  args: {
    children: () => null,
    canCreateOrganizations: true,
    getOrgPath: (organizationId) => `/organization/${organizationId}`,
  },
  render: (args) => (
    <OrganizationDropdownMenu {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Trigger
        </button>
      )}
    </OrganizationDropdownMenu>
  ),
});

export const Default = meta.story({
  args: {
    state: "loaded",
    organizations,
  },
});

export const Many = meta.story({
  args: {
    state: "loaded",
    organizations: Array.from({ length: 10 }, (_, index) =>
      createOrganization(`org-${index + 1}`, `Organization ${index + 1}`),
    ),
  },
});

export const WithoutCreation = meta.story({
  args: {
    state: "loaded",
    organizations,
    canCreateOrganizations: false,
  },
});

export const Loading = meta.story({
  args: {
    state: "loading",
  },
});

export const TestReplayPrivacy = meta.story({
  name: "(Test) Blocks session replay",
  args: {
    state: "loaded",
    organizations: [createOrganization("org-private", "Private organization")],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Trigger" });
    await userEvent.click(trigger);

    const menu = await body.findByRole("menu", { name: "Organizations" });
    const name = within(menu).getByRole("link", {
      name: "Private organization",
    });
    const settings = within(menu).getByRole("link", {
      name: "Go to settings for Private organization",
    });
    const replayBlock = name.closest(".ph-no-capture");
    await expect(replayBlock).not.toBeNull();
    await expect(replayBlock).toContainElement(settings);
    await expect(replayBlock).not.toContainElement(trigger);
    await expect(canvasElement).not.toContainElement(menu);
  },
});
