/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { Button } from "@/src/components/ui/button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type GetModelResult } from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { useDeleteModelDefinition } from "@/src/features/models/hooks/useModelDefinitionApi";
import {
  type ModelOwner,
  useCanEditModels,
} from "@/src/features/models/modelOwner";

export const DeleteModelButton = ({
  modelData,
  owner,
  onSuccess,
}: {
  modelData: GetModelResult;
  owner: ModelOwner;
  onSuccess?: () => void;
}) => {
  const capture = usePostHogClientCapture();
  const { remove, isPending, error, reset } = useDeleteModelDefinition(owner);
  const hasAccess = useCanEditModels(owner);

  return (
    <ConfirmationDialogController
      title="Delete model?"
      text="This action permanently deletes this model definition."
      confirmLabel="Delete model"
      variant="destructive"
      error={error}
      loading={isPending}
      onConfirm={async () => {
        capture("models:delete_button_click");
        try {
          await remove(modelData.id);
        } catch (error) {
          reportTrpcErrorWithoutToast(error, "models");
          throw error;
        }
        onSuccess?.();
      }}
    >
      {({ openDialog }) => (
        <Button
          variant="outline"
          title="Delete model"
          disabled={!hasAccess}
          className="border-dark-red/30 flex items-center"
          onClick={() => {
            reset();
            openDialog();
          }}
        >
          <span className="text-dark-red">Delete</span>
        </Button>
      )}
    </ConfirmationDialogController>
  );
};
