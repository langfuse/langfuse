import preview from "@/.storybook/preview";
import { GatewayMemberTile } from "./GatewayMemberTile";

const ORG_ID = "org-acme";
const ORG_NAME = "Acme";

const meta = preview.meta({
  component: GatewayMemberTile,
});

export const NoKey = meta.story({
  args: { orgId: ORG_ID, orgName: ORG_NAME, status: "noKey" },
});

export const HasKey = meta.story({
  args: { orgId: ORG_ID, orgName: ORG_NAME, status: "hasKey" },
});

export const SetupPending = meta.story({
  args: { orgId: ORG_ID, orgName: ORG_NAME, status: "setupPending" },
});

export const Loading = meta.story({
  args: { orgId: ORG_ID, orgName: ORG_NAME, status: undefined },
});
