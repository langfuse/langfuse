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
        They take precedence over Langfuse defaults. A project model with the
        same name takes precedence in that project.
      </p>
      <ConnectedModelDefinitionsTable
        owner={{ scope: "organization", organizationId }}
      />
    </>
  );
}
