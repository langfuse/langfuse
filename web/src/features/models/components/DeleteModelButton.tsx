/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { useHasProjectAccess } from "@/src/features/rbac";
import { Button } from "@/src/components/ui/button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type GetModelResult } from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { useState } from "react";

export const DeleteModelButton = ({
  modelData,
  projectId,
  onSuccess,
}: {
  modelData: GetModelResult;
  projectId: string;
  onSuccess?: () => void;
}) => {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [error, setError] = useState<string | undefined>();
  const mut = api.models.delete.useMutation({
    onSuccess: () => {
      utils.models.invalidate();
      setError(undefined);
      onSuccess?.();
    },
    onError: (error) => setError(error.message),
  });

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  return (
    <ConfirmationDialogController
      title="Delete model?"
      text="This action permanently deletes this model definition."
      confirmLabel="Delete model"
      variant="destructive"
      error={error}
      loading={mut.isPending}
      onConfirm={async () => {
        capture("models:delete_button_click");
        await mut.mutateAsync({
          projectId,
          modelId: modelData.id,
        });
      }}
    >
      {({ openDialog }) => (
        <Button
          variant="outline"
          title="Delete model"
          disabled={!hasAccess}
          className="border-light-red flex items-center"
          onClick={() => {
            setError(undefined);
            openDialog();
          }}
        >
          <span className="text-dark-red">Delete</span>
        </Button>
      )}
    </ConfirmationDialogController>
  );
};
