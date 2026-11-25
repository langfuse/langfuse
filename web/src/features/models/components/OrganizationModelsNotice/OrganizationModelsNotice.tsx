import { Building2 } from "@langfuse/icons";

import { Banner } from "@/src/components/design-system/Banner/Banner";

/** Tells a project page where its organization models come from. */
export function OrganizationModelsNotice({
  organizationName,
  manageHref,
}: {
  organizationName: string;
  /** Only for viewers who can manage organization models. */
  manageHref?: string;
}) {
  return (
    <Banner
      variant="info"
      icon={Building2}
      actions={
        manageHref
          ? [{ text: "Manage organization models", href: manageHref }]
          : undefined
      }
    >
      Organization models apply to all projects in {organizationName} when no
      project model matches.
      {manageHref
        ? null
        : " Ask an organization owner or admin to change them."}
    </Banner>
  );
}
