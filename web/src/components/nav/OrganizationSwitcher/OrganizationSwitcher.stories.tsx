import type { ComponentProps } from "react";
import preview from "../../../../.storybook/preview";
import { SidebarProvider } from "@/src/components/ui/sidebar";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

type Organization = NonNullable<
  ComponentProps<typeof OrganizationSwitcher>["organizations"]
>[number];

const createOrganization = (
  id: string,
  name: string,
  plan: Organization["plan"],
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
  createOrganization("org-dev", "langfuse-dev-INTERNAL", "cloud:team"),
  createOrganization("org-acme", "Acme Inc.", "cloud:hobby"),
];

const meta = preview.meta({
  component: OrganizationSwitcher,
  args: {
    organization: { id: "org-dev", name: "langfuse-dev-INTERNAL" },
    organizations,
    canCreateOrganizations: true,
    logo: {},
  },
  render: (args) => (
    <SidebarProvider>
      <div className="flex w-64">
        <OrganizationSwitcher {...args} />
      </div>
    </SidebarProvider>
  ),
});

export const Default = meta.story({});

export const LongName = meta.story({
  args: {
    organization: {
      id: "org-long",
      name: "An organization name that is too long to fit in the sidebar",
    },
  },
});

export const NoOrganization = meta.story({
  args: { organization: null },
});

export const CustomLogo = meta.story({
  args: {
    logo: {
      lightModeHref: "/langfuse-by-clickhouse.svg",
      darkModeHref: "/langfuse-by-clickhouse-white.svg",
    },
  },
});

export const Loading = meta.story({
  args: { organizations: null },
});
