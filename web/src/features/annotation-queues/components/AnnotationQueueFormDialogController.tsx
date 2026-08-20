import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { api } from "@/src/utils/api";

type AnnotationQueueFormDialogControllerProps = {
  projectId: string;
  onSuccess: (queueId: string) => void;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      queueId: string;
    }
);

export function AnnotationQueueFormDialogController(
  props: AnnotationQueueFormDialogControllerProps,
) {
  const { projectId, onSuccess, mode, children } = props;
  const queueId = mode === "edit" ? props.queueId : undefined;

  const [open, setOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const hasQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  const disabled = hasQueueAccess
    ? undefined
    : {
        reason: `You don't have permission to ${mode} annotation queues.`,
      };

  const openDialog = () => {
    if (!hasQueueAccess) return;
    setOpen(true);
  };

  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:read",
  });

  const capture = usePostHogClientCapture();

  const form = useForm({
    resolver: zodResolver(CreateQueueWithAssignmentsData),
  });

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId ?? "" },
    { enabled: mode === "edit" && hasQueueAccess && open },
  );
  const configsQuery = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: hasQueueAccess && open },
  );
  const allQueueNamesAndIds = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: hasQueueAccess && mode === "create" && open },
  );

  useEffect(() => {
    if (!open) return;

    setIsAdvancedOpen(false);
    if (mode === "edit" && queueQuery.data) {
      form.reset({
        name: queueQuery.data.name,
        description: queueQuery.data.description || undefined,
        scoreConfigIds: queueQuery.data.scoreConfigs.map(
          (config: ScoreConfigDomain) => config.id,
        ),
        newAssignmentUserIds: [],
      });
      return;
    }

    if (mode === "create") {
      form.reset({
        name: "",
        scoreConfigIds: [],
        newAssignmentUserIds: [],
      });
    }
  }, [form, mode, open, queueQuery.data]);

  const allQueueNames = useMemo(
    () =>
      mode === "create"
        ? (allQueueNamesAndIds.data?.map((queue) => ({ value: queue.name })) ??
          [])
        : [],
    [allQueueNamesAndIds.data, mode],
  );

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: allQueueNames,
    form,
    errorMessage: "Queue name already exists.",
  });

  const utils = api.useUtils();
  const createQueueMutation = api.annotationQueues.create.useMutation();
  const editQueueMutation = api.annotationQueues.update.useMutation();
  const createQueueAssignmentsMutation =
    api.annotationQueueAssignments.createMany.useMutation();

  const handleSubmit = async (data: CreateQueueWithAssignments) => {
    try {
      const queueResponse =
        mode === "edit"
          ? await editQueueMutation.mutateAsync({
              name: data.name,
              description: data.description,
              scoreConfigIds: data.scoreConfigIds,
              projectId,
              queueId: props.queueId,
            })
          : await createQueueMutation.mutateAsync({
              name: data.name,
              description: data.description,
              scoreConfigIds: data.scoreConfigIds,
              projectId,
            });
      const targetQueueId = mode === "edit" ? props.queueId : queueResponse.id;

      if (data.newAssignmentUserIds.length > 0) {
        await createQueueAssignmentsMutation.mutateAsync({
          projectId,
          queueId: targetQueueId,
          userIds: data.newAssignmentUserIds,
        });
      }

      await Promise.all([
        utils.annotationQueues.invalidate(),
        utils.annotationQueueAssignments.invalidate(),
      ]);
      form.reset();
      onSuccess(targetQueueId);
      setOpen(false);
    } catch {
      showErrorToast(
        "Operation failed",
        "Failed to create or update queue or assign users. Please try again.",
      );
    }
  };

  const handleScoreConfigValueChange = (values: Record<string, string>[]) => {
    form.setValue(
      "scoreConfigIds",
      values.map((value) => value.key),
    );

    if (values.length === 0) {
      form.setError("scoreConfigIds", {
        type: "manual",
        message: "At least 1 score config must be selected",
      });
    } else {
      form.clearErrors("scoreConfigIds");
    }
  };

  const isSubmitting =
    createQueueMutation.isPending ||
    editQueueMutation.isPending ||
    createQueueAssignmentsMutation.isPending;

  return (
    <Dialog open={hasQueueAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
      {configsQuery.data && (mode === "create" || queueQuery.data) ? (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormDialogContent
            mode={mode}
            form={form}
            scoreConfigs={configsQuery.data.configs}
            projectId={projectId}
            onScoreConfigValueChange={handleScoreConfigValueChange}
            onManageScoreConfigsClick={() => {
              capture("score_configs:manage_configs_item_click", {
                source: "AnnotationQueue",
              });
            }}
            isAdvancedOpen={isAdvancedOpen}
            onAdvancedOpenChange={setIsAdvancedOpen}
            hasQueueAssignmentsReadAccess={hasQueueAssignmentsReadAccess}
            userAssignmentSection={
              <UserAssignmentSection
                projectId={projectId}
                queueId={queueId}
                selectedUserIds={form.watch("newAssignmentUserIds")}
                onChange={(userIds) =>
                  form.setValue("newAssignmentUserIds", userIds)
                }
              />
            }
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            submitLabel={mode === "edit" ? "Save queue" : "Create queue"}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
