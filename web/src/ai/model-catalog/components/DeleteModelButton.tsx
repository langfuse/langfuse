/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { useHasProjectAccess } from "@/src/identity/access-control";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { ConfirmationDialogController } from "@/src/app/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type GetModelResult } from "@/src/ai/model-catalog/validation";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { api, reportTrpcErrorWithoutToast } from "@/src/app/utils/api";
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
        try {
          await mut.mutateAsync({
            projectId,
            modelId: modelData.id,
          });
        } catch (error) {
          reportTrpcErrorWithoutToast(error, "models");
          throw error;
        }
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
