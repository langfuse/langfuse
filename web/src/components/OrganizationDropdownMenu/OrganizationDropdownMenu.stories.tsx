import type { ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import { OrganizationDropdownMenu } from "./OrganizationDropdownMenu";

type Organization = Extract<
  ComponentProps<typeof OrganizationDropdownMenu>,
  { state: "loaded" }
>["organizations"][number];

const createOrganization = (
  id: string,
  name: string,
  plan: Organization["plan"] = "cloud:hobby",
): Organization => ({
  id,
  name,
  role: "OWNER",
  cloudConfig: undefined,
  plan,
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

export const PlanBadges = meta.story({
  args: {
    state: "loaded",
    organizations: [
      createOrganization("org-hobby", "Hobby org", "cloud:hobby"),
      createOrganization("org-pro", "Pro org", "cloud:pro"),
      createOrganization("org-team", "Team org", "cloud:team"),
      createOrganization("org-oss", "Self-hosted org", "oss"),
    ],
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
