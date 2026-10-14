import { ScoreDataTypeEnum } from "@langfuse/shared";
import { type ReactNode } from "react";

import { DialogController } from "@/src/app/design-system/DialogController/DialogController";
import { DialogContent } from "@/src/app/design-system/legacy-primitives/dialog";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { UpsertScoreConfigDialogContent } from "@/src/scores/configuration/components/UpsertScoreConfigDialogContent";
import {
  type CreateConfig,
  type UpdateConfig,
} from "@/src/scores/configuration/lib/upsertFormTypes";
import { api, type RouterOutputs } from "@/src/app/utils/api";

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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
        </DialogContent>
      )}
    >
      {({ openDialog }) =>
        children({ disabled, isSubmitting: mutation.isPending, openDialog })
      }
    </DialogController>
  );
}

export function EditScoreConfigDialogController({
  projectId,
  children,
}: {
  projectId: string;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: (defaultValues: UpdateConfig) => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });
  const utils = api.useUtils();
  const mutation = api.scoreConfigs.update.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
  });
  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to edit score configs." };

  return (
    <DialogController<UpdateConfig>
      renderDialog={({ state: defaultValues, closeDialog }) => (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <UpsertScoreConfigDialogContent
            key={defaultValues.id}
            mode="edit"
            defaultValues={defaultValues}
            onSubmit={async (values) => {
              await mutation.mutateAsync({
                ...values,
                projectId,
                id: defaultValues.id,
                description: values.description ?? null,
                categories: values.categories?.length
                  ? values.categories
                  : undefined,
              });
              capture("score_configs:update_form_submit", {
                dataType: values.dataType,
              });
            }}
            onFormSuccess={closeDialog}
            isSubmitting={mutation.isPending}
          />
        </DialogContent>
      )}
    >
      {({ openDialog }) => children({ disabled, openDialog })}
    </DialogController>
  );
}
