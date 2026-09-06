import { useHasProjectAccess } from "@/src/features/rbac";
import { ScoreDataTypeEnum } from "@langfuse/shared";
import { type ReactNode, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
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
  dataType: ScoreDataTypeEnum.NUMERIC,
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
    : { reason: `You don't have permission to ${mode} score configs.` };

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

  const content =
    mode === "edit" ? (
      <UpsertScoreConfigDialogContent
        mode="edit"
        defaultValues={props.defaultValues}
        onSubmit={handleSubmit}
        onFormSuccess={() => setOpen(false)}
        isSubmitting={isSubmitting}
      />
    ) : (
      <UpsertScoreConfigDialogContent
        mode="create"
        defaultValues={createDefaultValues}
        onSubmit={handleSubmit}
        onFormSuccess={() => setOpen(false)}
        isSubmitting={isSubmitting}
      />
    );

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {children({ disabled, isSubmitting, Trigger: DialogTrigger })}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {hasAccess && open ? content : null}
      </DialogContent>
    </Dialog>
  );
}
