import preview from "@/.storybook/preview";
import { OrganizationSettingsTile } from "./OrganizationSettingsTile";

const meta = preview.meta({
  component: OrganizationSettingsTile,
});

export const Default = meta.story({
  args: {
    orgId: "org-acme",
    canCreateProject: false,
  },
});
