import { ScoreDataTypeEnum } from "@langfuse/shared";
import { type ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { UpsertScoreConfigDialogContent } from "@/src/features/score-configs/components/UpsertScoreConfigDialogContent";
import { type CreateConfig } from "@/src/features/score-configs/lib/upsertFormTypes";
import { api, type RouterOutputs } from "@/src/utils/api";

const createDefaultValues: CreateConfig = {
  dataType: ScoreDataTypeEnum.NUMERIC,
  minValue: undefined,
  maxValue: undefined,
  name: "",
};

export function CreateScoreConfigDialogController({
  projectId,
  onAfterCreate,
  children,
}: {
  projectId: string;
  onAfterCreate?: (config: RouterOutputs["scoreConfigs"]["create"]) => void;
  children: (control: {
    disabled: { reason: string } | undefined;
    isSubmitting: boolean;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });
  const utils = api.useUtils();
  const mutation = api.scoreConfigs.create.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
  });
  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to create score configs." };

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <UpsertScoreConfigDialogContent
          mode="create"
          defaultValues={createDefaultValues}
          onSubmit={async (values) => {
            const config = await mutation.mutateAsync({
              projectId,
              ...values,
              description: values.description ?? null,
              categories: values.categories?.length
                ? values.categories
                : undefined,
            });
            capture("score_configs:create_form_submit", {
              dataType: values.dataType,
            });
            onAfterCreate?.(config);
          }}
          onFormSuccess={closeDialog}
          isSubmitting={mutation.isPending}
        />
      )}
    >
      {({ openDialog }) =>
        children({ disabled, isSubmitting: mutation.isPending, openDialog })
      }
    </DialogController>
  );
}
