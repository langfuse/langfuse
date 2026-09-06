import { showErrorToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  type CreateQueueWithAssignments,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { type ReactNode, useRef, useState } from "react";

import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
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
  const createdQueueIdRef = useRef<string | undefined>(undefined);

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
    createdQueueIdRef.current = undefined;
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
  const configsQuery = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: hasQueueAccess && open },
  );
  const allQueueNamesAndIds = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: hasQueueAccess && mode === "create" && open },
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
        if (mode === "edit") {
          await editQueueMutation.mutateAsync({
            name: data.name,
            description: data.description,
            scoreConfigIds: data.scoreConfigIds,
            projectId,
            queueId: props.queueId,
          });
          targetQueueId = props.queueId;
        } else if (createdQueueIdRef.current) {
          targetQueueId = createdQueueIdRef.current;
        } else {
          const queueResponse = await createQueueMutation.mutateAsync({
            name: data.name,
            description: data.description,
            scoreConfigIds: data.scoreConfigIds,
            projectId,
          });
          targetQueueId = queueResponse.id;
          createdQueueIdRef.current = targetQueueId;
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
        createdQueueIdRef.current = undefined;
        onSuccess(targetQueueId);
        setOpen(false);
      } catch {
        showErrorToast(
          "Operation failed",
          "Failed to create or update queue or assign users. Please try again.",
        );
      }
    },
    [
      createQueueAssignmentsMutation,
      createQueueMutation,
      editQueueMutation,
      mode,
      onSuccess,
      projectId,
      props,
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
            scoreConfigIds: queueQuery.data.scoreConfigs.map(
              (config: ScoreConfigDomain) => config.id,
            ),
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
            scoreConfigs={configsQuery.data.configs}
            projectId={projectId}
            queueId={queueId}
            queueNames={
              mode === "create"
                ? (allQueueNamesAndIds.data?.map((queue) => queue.name) ?? [])
                : []
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
