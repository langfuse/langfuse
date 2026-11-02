import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { type GetModelResult } from "@/src/features/models/validation";

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
