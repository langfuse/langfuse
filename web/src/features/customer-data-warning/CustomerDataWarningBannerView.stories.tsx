import preview from "../../../.storybook/preview";
import { CustomerDataWarningBannerView } from "./CustomerDataWarningBannerView";

const meta = preview.meta({
  component: CustomerDataWarningBannerView,
});

/**
 * ClickHouse or Langfuse staff viewing a customer project they are not a member of.
 * The strip stays up for the page load; it has no dismiss control.
 */
export const Project = meta.story({
  args: {
    scope: "project",
    organizationName: "Acme",
    projectName: "Production",
  },
});

/** Same strip on an organization page, where there is no project name. */
export const Organization = meta.story({
  args: {
    scope: "organization",
    organizationName: "Acme",
  },
});
