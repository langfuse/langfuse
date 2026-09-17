import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { UpsertModelFormDialog } from "./UpsertModelFormDialog/UpsertModelFormDialog";
import { type GetModelResult } from "../validation";

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
    <UpsertModelFormDialog {...{ modelData, projectId, action: "edit" }}>
      <Button
        variant="outline"
        disabled={!hasAccess}
        title="Edit model"
        className="flex items-center"
      >
        <span>Edit</span>
      </Button>
    </UpsertModelFormDialog>
  );
};
