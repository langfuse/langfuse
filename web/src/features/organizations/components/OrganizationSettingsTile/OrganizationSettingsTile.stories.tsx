import preview from "@/.storybook/preview";
import { OrganizationSettingsTile } from "./OrganizationSettingsTile";

const meta = preview.meta({
  component: OrganizationSettingsTile,
  args: { orgId: "org-acme", orgName: "Acme" },
});

export const NoProjects = meta.story({
  args: { state: "noProjects" },
});

export const NoProjectAccess = meta.story({
  args: { state: "noProjectAccess" },
});

export const GatewayNoKey = meta.story({
  args: { state: "gatewayNoKey" },
});

export const GatewayHasKey = meta.story({
  args: { state: "gatewayHasKey" },
});

export const GatewaySetupPending = meta.story({
  args: { state: "gatewaySetupPending" },
});

export const GatewayLoading = meta.story({
  args: { state: "gatewayLoading" },
});
