import { useTakesLangfuseDefaultName } from "@/src/features/models/hooks/useModelDefinitionApi";
import { LangfuseDefaultNameWarning } from "./LangfuseDefaultNameWarning";

/** Warns when an organization model would take a Langfuse default's name. */
export function ConnectedLangfuseDefaultNameWarning({
  organizationId,
  modelName,
}: {
  organizationId: string;
  modelName: string;
}) {
  const takesDefaultName = useTakesLangfuseDefaultName(
    organizationId,
    modelName,
  );

  return (
    <div aria-live="polite">
      {takesDefaultName ? <LangfuseDefaultNameWarning /> : null}
    </div>
  );
}
