import { api } from "@/src/utils/api";
import { LangfuseDefaultNameWarning } from "./LangfuseDefaultNameWarning";

/** Warns when an organization model would take a Langfuse default's name. */
export function ConnectedLangfuseDefaultNameWarning({
  organizationId,
  modelName,
}: {
  organizationId: string;
  modelName: string;
}) {
  const name = modelName.trim();
  const matches = api.organizationModels.getAll.useQuery(
    { orgId: organizationId, searchString: name, page: 0, limit: 50 },
    {
      enabled: name.length > 0,
      staleTime: 1000 * 60,
      placeholderData: (previous) => previous,
    },
  );
  const takesDefaultName = (matches.data?.models ?? []).some(
    (model) => model.scope === "LANGFUSE" && model.modelName === name,
  );

  return (
    <div aria-live="polite">
      {takesDefaultName ? <LangfuseDefaultNameWarning /> : null}
    </div>
  );
}
