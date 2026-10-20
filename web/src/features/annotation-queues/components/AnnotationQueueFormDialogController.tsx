import { type ReactNode, useState } from "react";
import { type CreateQueueWithAssignments } from "@langfuse/shared";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { showErrorToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { QueueScoreConfigFields } from "./QueueScoreConfigFields";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

export function AnnotationQueueFormDialogController(
  props: AnnotationQueueFormDialogControllerProps,
) {
  const { projectId, onSuccess, mode, children } = props;
  const hasQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const disabled = hasQueueAccess
    ? undefined
    : { reason: `You don't have permission to ${mode} annotation queues.` };
  return (
    <DialogController
      renderDialog={({ closeDialog, isOpen }) =>
        hasQueueAccess ? (
          <AnnotationQueueDialogData
            projectId={projectId}
            queueId={mode === "edit" ? props.queueId : undefined}
            mode={mode}
            isOpen={isOpen}
            onSuccess={onSuccess}
            closeDialog={closeDialog}
          />
        ) : null
      }
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            if (hasQueueAccess) openDialog();
          },
        })
      }
    </DialogController>
  );
}

function AnnotationQueueDialogData({
  projectId,
  queueId,
  mode,
  isOpen,
  onSuccess,
  closeDialog,
}: {
  projectId: string;
  queueId: string | undefined;
  mode: "create" | "edit";
  isOpen: boolean;
  onSuccess: (queueId: string) => void;
  closeDialog: () => void;
}) {
  const [createdQueueId, setCreatedQueueId] = useState<string>();
  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:read",
  });
  const { queueQuery, configsQuery, allQueueNamesAndIds } = useQueueFormData({
    projectId,
    queueId,
    mode,
    isOpen,
  });
  const utils = api.useUtils();
  const createQueueMutation = api.annotationQueues.create.useMutation();
  const editQueueMutation = api.annotationQueues.update.useMutation();
  const createQueueAssignmentsMutation =
    api.annotationQueueAssignments.createMany.useMutation();
  const [handleSubmit, isSubmitting] = useWatchedPromiseCallback(
    async (data: CreateQueueWithAssignments) => {
      try {
        const targetQueueId = await saveQueueWithAssignments({
          data,
          projectId,
          existingQueueId: queueId ?? createdQueueId,
          includeScoreConfigs: mode === "create",
          createQueue: createQueueMutation.mutateAsync,
          updateQueue: editQueueMutation.mutateAsync,
          assignUsers: createQueueAssignmentsMutation.mutateAsync,
          onQueueCreated: setCreatedQueueId,
        });
        await Promise.all([
          utils.annotationQueues.invalidate(),
          utils.annotationQueueAssignments.invalidate(),
        ]);
        setCreatedQueueId(undefined);
        onSuccess(targetQueueId);
        closeDialog();
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
      closeDialog,
      onSuccess,
      projectId,
      queueId,
      mode,
      utils.annotationQueueAssignments,
      utils.annotationQueues,
    ],
  );
  const initialValues = prepareQueueFormValues(mode, queueQuery.data);
  const configs = configsQuery.data?.configs;
  const queues = allQueueNamesAndIds.data;
  if ((mode === "create" && !configs) || !initialValues || !queues) {
    return (
      <Dialog
        title={mode === "edit" ? "Queue settings" : "New annotation queue"}
      >
        <Dialog.Body>
          <Skeleton className="h-64 w-full" />
        </Dialog.Body>
      </Dialog>
    );
  }
  return (
    <AnnotationQueueFormDialogContent
      mode={mode}
      initialValues={initialValues}
      projectId={projectId}
      queueId={queueId ?? createdQueueId}
      queueNames={queues
        .filter((queue) => queue.id !== (queueId ?? createdQueueId))
        .map((queue) => queue.name)}
      hasQueueAssignmentsReadAccess={hasQueueAssignmentsReadAccess}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel={mode === "edit" ? "Save queue" : "Create queue"}
    >
      {({ value, onChange }) => (
        <QueueScoreConfigFields
          projectId={projectId}
          configs={configs ?? []}
          value={value}
          onChange={onChange}
          disabled={isSubmitting}
          warnOnRemoval={false}
        />
      )}
    </AnnotationQueueFormDialogContent>
  );
}

function useQueueFormData({
  projectId,
  queueId,
  mode,
  isOpen,
}: {
  projectId: string;
  queueId: string | undefined;
  mode: "create" | "edit";
  isOpen: boolean;
}) {
  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId ?? "" },
    { enabled: mode === "edit" && isOpen },
  );
  const configsQuery = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: isOpen && mode === "create" },
  );
  const allQueueNamesAndIds = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: isOpen },
  );
  return { queueQuery, configsQuery, allQueueNamesAndIds };
}
function prepareQueueFormValues(
  mode: "create" | "edit",
  queue: RouterOutputs["annotationQueues"]["byId"] | undefined,
): CreateQueueWithAssignments | undefined {
  if (mode === "create") {
    return { name: "", scoreConfigIds: [], newAssignmentUserIds: [] };
  }
  if (!queue) return undefined;
  return {
    name: queue.name ?? "",
    description: queue.description || undefined,
    scoreConfigIds: queue.scoreConfigs.map((config) => config.id),
    newAssignmentUserIds: [],
  };
}

async function saveQueueWithAssignments({
  data,
  projectId,
  existingQueueId,
  includeScoreConfigs,
  createQueue,
  updateQueue,
  assignUsers,
  onQueueCreated,
}: {
  data: CreateQueueWithAssignments;
  projectId: string;
  existingQueueId: string | undefined;
  includeScoreConfigs: boolean;
  createQueue: (
    input: RouterInputs["annotationQueues"]["create"],
  ) => Promise<{ id: string }>;
  updateQueue: (
    input: RouterInputs["annotationQueues"]["update"],
  ) => Promise<unknown>;
  assignUsers: (
    input: RouterInputs["annotationQueueAssignments"]["createMany"],
  ) => Promise<unknown>;
  onQueueCreated: (queueId: string) => void;
}) {
  const queueData = {
    name: data.name,
    description: data.description,
    scoreConfigIds: data.scoreConfigIds,
    projectId,
  };
  let targetQueueId = existingQueueId;
  if (targetQueueId) {
    await updateQueue({
      ...queueData,
      scoreConfigIds: includeScoreConfigs ? data.scoreConfigIds : undefined,
      queueId: targetQueueId,
    });
  } else {
    const queue = await createQueue(queueData);
    targetQueueId = queue.id;
    onQueueCreated(targetQueueId);
  }
  if (data.newAssignmentUserIds.length > 0) {
    await assignUsers({
      projectId,
      queueId: targetQueueId,
      userIds: data.newAssignmentUserIds,
    });
  }
  return targetQueueId;
}

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
