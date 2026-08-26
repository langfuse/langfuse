import { ScoreConfigDataType } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import {
  type CreateConfig,
  type UpdateConfig,
} from "@/src/features/score-configs/lib/upsertFormTypes";
import { UpsertScoreConfigDialogContent } from "./UpsertScoreConfigDialogContent";
import { PlusIcon } from "lucide-react";

export function UpsertScoreConfigDialog({
  projectId,
  id,
  open,
  onOpenChange,
  defaultValues,
}: {
  projectId: string;
  id?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: CreateConfig | UpdateConfig;
}) {
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
  if (!hasAccess) return null;

  async function onSubmit(values: CreateConfig | UpdateConfig) {
    if (id) {
      await updateScoreConfig.mutateAsync({
        ...values,
        projectId,
        id,
        description: values.description ?? null,
        categories: values.categories?.length ? values.categories : undefined,
      });
      capture("score_configs:update_form_submit", {
        dataType: values.dataType,
      });
    } else {
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
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          loading={createScoreConfig.isPending || updateScoreConfig.isPending}
        >
          <PlusIcon className="mr-1.5 -ml-0.5 h-4 w-4" aria-hidden="true" />
          {id ? "Update score config" : "Add new score config"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <UpsertScoreConfigDialogContent
          mode={id ? "edit" : "create"}
          defaultValues={
            defaultValues ?? {
              dataType: ScoreConfigDataType.NUMERIC,
              minValue: undefined,
              maxValue: undefined,
              name: "",
            }
          }
          onSubmit={onSubmit}
          onFormSuccess={() => onOpenChange(false)}
          isSubmitting={
            createScoreConfig.isPending || updateScoreConfig.isPending
          }
        />
      </DialogContent>
    </Dialog>
  );
}
