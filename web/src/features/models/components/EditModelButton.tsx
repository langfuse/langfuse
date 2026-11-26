import { Button } from "@/src/components/ui/button";
import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { type GetModelResult } from "@/src/features/models/validation";
import {
  type ModelOwner,
  useCanEditModels,
} from "@/src/features/models/modelOwner";

export const EditModelButton = ({
  modelData,
  owner,
}: {
  modelData: GetModelResult;
  owner: ModelOwner;
}) => {
  const hasAccess = useCanEditModels(owner);

  return (
    <UpsertModelFormDialogController {...{ modelData, owner, action: "edit" }}>
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
