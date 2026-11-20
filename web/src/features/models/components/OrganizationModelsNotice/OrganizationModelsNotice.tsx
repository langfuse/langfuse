import { Building2 } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";

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
    <Alert variant="info" icon={Building2}>
      <Alert.Description>
        <p>
          Organization models apply to all projects in {organizationName}.{" "}
          {manageHref ? (
            <TextLink path={manageHref} value="Manage organization models" />
          ) : (
            "Ask an organization owner or admin to change them."
          )}
        </p>
      </Alert.Description>
    </Alert>
  );
}
