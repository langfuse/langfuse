import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { UpsertModelFormDialogController } from "@/src/ai/model-catalog/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { type GetModelResult } from "@/src/ai/model-catalog/validation";

export const EditModelButton = ({
  modelData,
  projectId,
}: {
  modelData: GetModelResult;
  projectId: string;
}) => {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  return (
    <UpsertModelFormDialogController
      {...{ modelData, projectId, action: "edit" }}
    >
      {({ openDialog }) => (
        <Button
          variant="outline"
          disabled={!hasAccess}
          title="Edit model"
          className="flex items-center"
          onClick={openDialog}
        >
          <span>Edit</span>
        </Button>
      )}
    </UpsertModelFormDialogController>
  );
};
