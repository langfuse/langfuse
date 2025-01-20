import Header from "@/src/components/layouts/header";
import ModelTable from "@/src/components/table/use-cases/models";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

import { ActionButton } from "@/src/components/ActionButton";
import { PlusIcon } from "lucide-react";

export function ModelsSettings(props: { projectId: string }) {
  const hasWriteAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "models:CUD",
  });
  const capture = usePostHogClientCapture();
  return (
    <>
      <Header title="Models" level="h3" />
      <p className="mb-4 text-sm">
        A model represents a LLM model. It is used to calculate tokens and cost.
      </p>
      <ModelTable projectId={props.projectId} />
      <UpsertModelFormDrawer
        {...{ projectId: props.projectId, action: "create" }}
      >
        <ActionButton
          variant="secondary"
          icon={<PlusIcon className="h-4 w-4" />}
          hasAccess={hasWriteAccess}
          onClick={() => capture("models:new_form_open")}
        >
          Add model definition
        </ActionButton>
      </UpsertModelFormDrawer>
    </>
  );
}
