import { Button } from "@/src/components/ui/button";
import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { type GetModelResult } from "@/src/features/models/validation";
import {
  cloneLabelFor,
  type ModelOwner,
  useCanEditModels,
} from "@/src/features/models/modelOwner";

export const CloneModelButton = ({
  modelData,
  owner,
}: {
  modelData: GetModelResult;
  owner: ModelOwner;
}) => {
  const hasAccess = useCanEditModels(owner);

  return (
    <UpsertModelFormDialogController {...{ modelData, owner, action: "clone" }}>
      {({ openDialog }) => (
        <Button
          variant="outline"
          disabled={!hasAccess}
          title={cloneLabelFor(owner)}
          className="flex items-center"
          onClick={openDialog}
        >
          <span>{cloneLabelFor(owner)}</span>
        </Button>
      )}
    </UpsertModelFormDialogController>
  );
};
