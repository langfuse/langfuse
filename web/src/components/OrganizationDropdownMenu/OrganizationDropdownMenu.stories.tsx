import type { ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
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
];

const meta = preview.meta({
  component: OrganizationDropdownMenu,
  args: {
    canCreateOrganizations: true,
    getOrgPath: (organizationId) => `/organization/${organizationId}`,
  },
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Current organization</DropdownMenuTrigger>
      <OrganizationDropdownMenu {...args} />
    </DropdownMenu>
  ),
});

export const Default = meta.story({
  args: {
    state: "loaded",
    organizations,
  },
});

export const Scrollable = meta.story({
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

export const WithLongName = meta.story({
  args: {
    state: "loaded",
    organizations: [
      createOrganization(
        "org-long-name",
        "An organization name that is too long to fit in the menu",
      ),
      ...organizations,
    ],
  },
});

export const Loading = meta.story({
  args: {
    state: "loading",
  },
});
