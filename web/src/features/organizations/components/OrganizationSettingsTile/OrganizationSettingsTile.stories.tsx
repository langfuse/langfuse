import preview from "@/.storybook/preview";
import { OrganizationSettingsTile } from "./OrganizationSettingsTile";

const ORG_ID = "org-acme";

const meta = preview.meta({
  component: OrganizationSettingsTile,
});

export const Default = meta.story({
  args: {
    orgId: ORG_ID,
    canCreateProject: false,
    isGatewayOnlyMember: false,
  },
});

export const AiGatewayMember = meta.story({
  args: {
    orgId: ORG_ID,
    canCreateProject: false,
    isGatewayOnlyMember: true,
  },
});
