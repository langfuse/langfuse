import Header from "@/src/components/layouts/header";
import { ConnectedModelDefinitionsTable } from "@/src/features/models/ModelDefinitionsTable/ConnectedModelDefinitionsTable";
import { OrganizationModelsNotice } from "@/src/features/models/components/OrganizationModelsNotice/OrganizationModelsNotice";
import { useOrganizationModelsNotice } from "@/src/features/models/hooks/useOrganizationModelsNotice";

export function ModelsSettings(props: { projectId: string }) {
  const notice = useOrganizationModelsNotice(props.projectId);
  return (
    <>
      <Header title="Model definitions" />
      <p className="mb-2 text-sm">
        Model definitions store the prices Langfuse uses to calculate the cost
        of generations. The match pattern decides which definition applies: a
        project model whose pattern matches the generation&apos;s model name is
        used first, then a matching organization model, then a matching Langfuse
        default.
      </p>
      {notice ? (
        <div className="mb-4">
          <OrganizationModelsNotice {...notice} />
        </div>
      ) : null}
      <ConnectedModelDefinitionsTable
        owner={{ scope: "project", projectId: props.projectId }}
      />
    </>
  );
}
