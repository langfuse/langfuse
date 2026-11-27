import preview from "../../../../../.storybook/preview";
import { OrganizationModelsNotice } from "./OrganizationModelsNotice";

const meta = preview.meta({
  component: OrganizationModelsNotice,
  args: { organizationName: "Acme" },
});

export const OrganizationAdmin = meta.story({
  args: { manageHref: "/organization/org-1/settings/models" },
});

export const ProjectMember = meta.story({});
