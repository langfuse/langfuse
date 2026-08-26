import { ScoreConfigDataType } from "@langfuse/shared";
import { type ReactNode, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { UpsertScoreConfigDialogContent } from "@/src/features/score-configs/components/UpsertScoreConfigDialogContent";
import {
  type CreateConfig,
  type UpdateConfig,
} from "@/src/features/score-configs/lib/upsertFormTypes";
import { api } from "@/src/utils/api";

type UpsertScoreConfigDialogControllerProps = {
  projectId: string;
  children: (control: {
    disabled: { reason: string } | undefined;
    isSubmitting: boolean;
    Trigger: typeof DialogTrigger;
  }) => ReactNode;
} & ({ mode: "create" } | { mode: "edit"; defaultValues: UpdateConfig });

const createDefaultValues: CreateConfig = {
  dataType: ScoreConfigDataType.NUMERIC,
  minValue: undefined,
  maxValue: undefined,
  name: "",
};

export function UpsertScoreConfigDialogController(
  props: UpsertScoreConfigDialogControllerProps,
) {
  const { children, projectId, mode } = props;
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });
  const utils = api.useUtils();
  const createScoreConfig = api.scoreConfigs.create.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
  });
  const updateScoreConfig = api.scoreConfigs.update.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
  });

  const isSubmitting =
    createScoreConfig.isPending || updateScoreConfig.isPending;
  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to edit score configs." };

  async function handleSubmit(values: CreateConfig | UpdateConfig) {
    if (mode === "edit") {
      await updateScoreConfig.mutateAsync({
        ...values,
        projectId,
        id: props.defaultValues.id,
        description: values.description ?? null,
        categories: values.categories?.length ? values.categories : undefined,
      });
      capture("score_configs:update_form_submit", {
        dataType: values.dataType,
      });
      return;
    }

    await createScoreConfig.mutateAsync({
      projectId,
      ...values,
      description: values.description ?? null,
      categories: values.categories?.length ? values.categories : undefined,
    });
    capture("score_configs:create_form_submit", {
      dataType: values.dataType,
    });
  }

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {children({ disabled, isSubmitting, Trigger: DialogTrigger })}
      {hasAccess && open ? (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <UpsertScoreConfigDialogContent
            mode={mode}
            defaultValues={
              mode === "edit" ? props.defaultValues : createDefaultValues
            }
            onSubmit={handleSubmit}
            onFormSuccess={() => setOpen(false)}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
