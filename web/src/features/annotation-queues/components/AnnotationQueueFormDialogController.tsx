/* eslint-disable no-nested-ternary */
import { showErrorToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { type CreateQueueWithAssignments } from "@langfuse/shared";
import { type ReactNode, useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";
import {
  CreateScoreConfigDialogController,
  EditScoreConfigDialogController,
} from "@/src/features/score-configs";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

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
  const [createdQueueId, setCreatedQueueId] = useState<string>();

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
    setCreatedQueueId(undefined);
    setOpen(true);
  };

  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:read",
  });

  const capture = usePostHogClientCapture();

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId ?? "" },
    { enabled: mode === "edit" && hasQueueAccess && open },
  );
  const itemsQuery = api.annotationQueueItems.itemsByQueueId.useQuery(
    { projectId, queueId: queueId ?? "", page: 0, limit: 1 },
    { enabled: mode === "edit" && hasQueueAccess && open },
  );
  const configsQuery = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: hasQueueAccess && open },
  );
  const allQueueNamesAndIds = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: hasQueueAccess && open },
  );

  const utils = api.useUtils();
  const createQueueMutation = api.annotationQueues.create.useMutation();
  const editQueueMutation = api.annotationQueues.update.useMutation();
  const createQueueAssignmentsMutation =
    api.annotationQueueAssignments.createMany.useMutation();

  const [handleSubmit, isSubmitting] = useWatchedPromiseCallback(
    async (data: CreateQueueWithAssignments) => {
      try {
        let targetQueueId: string;
        const existingQueueId = queueId ?? createdQueueId;
        if (existingQueueId) {
          await editQueueMutation.mutateAsync({
            name: data.name,
            description: data.description,
            scoreConfigIds: data.scoreConfigIds,
            projectId,
            queueId: existingQueueId,
          });
          targetQueueId = existingQueueId;
        } else {
          const queueResponse = await createQueueMutation.mutateAsync({
            name: data.name,
            description: data.description,
            scoreConfigIds: data.scoreConfigIds,
            projectId,
          });
          targetQueueId = queueResponse.id;
          setCreatedQueueId(targetQueueId);
        }

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
        setCreatedQueueId(undefined);
        onSuccess(targetQueueId);
        setOpen(false);
      } catch (error) {
        showErrorToast(
          "Operation failed",
          "Failed to create or update queue or assign users. Please try again.",
          classifyTrpcToastError(error, "annotation_queue.save"),
        );
      }
    },
    [
      createQueueAssignmentsMutation,
      createQueueMutation,
      editQueueMutation,
      createdQueueId,
      onSuccess,
      projectId,
      queueId,
      utils.annotationQueueAssignments,
      utils.annotationQueues,
    ],
  );

  const initialValues: CreateQueueWithAssignments | undefined =
    mode === "edit"
      ? queueQuery.data
        ? {
            name: queueQuery.data.name ?? "",
            description: queueQuery.data.description || undefined,
            scoreConfigIds: queueQuery.data.scoreConfigIds ?? [],
            newAssignmentUserIds: [],
          }
        : undefined
      : {
          name: "",
          scoreConfigIds: [],
          newAssignmentUserIds: [],
        };

  return (
    <Dialog open={hasQueueAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
      {open && configsQuery.data && initialValues ? (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormDialogContent
            mode={mode}
            initialValues={initialValues}
            renderScoreConfigEditor={({ value, onChange }) => (
              <CreateScoreConfigDialogController
                projectId={projectId}
                onAfterCreate={(config) => onChange([...value, config.id])}
              >
                {(create) => (
                  <EditScoreConfigDialogController projectId={projectId}>
                    {(edit) => (
                      <AnnotationQueueScoreConfigEditor
                        scoreConfigs={configsQuery.data!.configs}
                        value={value}
                        onChange={onChange}
                        disabled={isSubmitting}
                        warnOnRemoval={
                          mode === "edit" && itemsQuery.data?.totalItems !== 0
                        }
                        createAction={
                          <Button
                            text="Create score config"
                            size="sm"
                            variant="secondary"
                            disabled={isSubmitting || !!create.disabled}
                            onClick={create.openDialog}
                          />
                        }
                        editAction={{
                          disabled: edit.disabled,
                          onClick: (configId) => {
                            const config = configsQuery.data?.configs.find(
                              (config) => config.id === configId,
                            );
                            if (!config) return;
                            edit.openDialog({
                              id: config.id,
                              name: config.name,
                              dataType: config.dataType,
                              description: config.description ?? undefined,
                              minValue: config.minValue ?? undefined,
                              maxValue: config.maxValue ?? undefined,
                              categories: config.categories ?? undefined,
                            });
                          },
                        }}
                      />
                    )}
                  </EditScoreConfigDialogController>
                )}
              </CreateScoreConfigDialogController>
            )}
            projectId={projectId}
            queueId={queueId ?? createdQueueId}
            queueNames={
              allQueueNamesAndIds.data
                ?.filter((queue) => queue.id !== (queueId ?? createdQueueId))
                .map((queue) => queue.name) ?? []
            }
            onManageScoreConfigsClick={() => {
              capture("score_configs:manage_configs_item_click", {
                source: "AnnotationQueue",
              });
            }}
            hasQueueAssignmentsReadAccess={hasQueueAssignmentsReadAccess}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            submitLabel={mode === "edit" ? "Save queue" : "Create queue"}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
