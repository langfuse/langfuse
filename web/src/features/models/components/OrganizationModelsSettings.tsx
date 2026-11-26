import Header from "@/src/components/layouts/header";
import { ConnectedModelDefinitionsTable } from "@/src/features/models/ModelDefinitionsTable/ConnectedModelDefinitionsTable";

export function OrganizationModelsSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <>
      <Header title="Organization models" />
      <p className="mb-2 text-sm">
        Organization models set prices for every project in this organization.
        When a generation&apos;s model name matches their match pattern, they
        apply instead of a matching Langfuse default. A matching project model
        still comes first in its project.
      </p>
      <ConnectedModelDefinitionsTable
        owner={{ scope: "organization", organizationId }}
      />
    </>
  );
}
