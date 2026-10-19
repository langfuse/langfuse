import { type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, type RouterInputs } from "@/src/utils/api";
import { AnnotationQueueDetails } from "./AnnotationQueueDetails";
import {
  AnnotationQueueSetupForm,
  type AnnotationQueueSetupValues,
  type AnnotationQueueSetupDirtyFields,
} from "./AnnotationQueueSetupForm";
import { QueueScoreConfigFields } from "./QueueScoreConfigFields";
import { UserAssignmentSection } from "./UserAssignmentSection";

export function AnnotationQueueSetupController({
  projectId,
  queueId,
  renderLayout,
}: {
  projectId: string;
  queueId: string;
  renderLayout: (content: ReactNode) => ReactNode;
}) {
  const canEdit = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const hasAssignments = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:read",
  });
  const queue = api.annotationQueues.byId.useQuery(
    { projectId, queueId },
    { refetchOnMount: "always" },
  );
  const configs = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: canEdit, refetchOnMount: "always" },
  );
  const queues = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: canEdit },
  );
  const items = api.annotationQueueItems.itemsByQueueId.useQuery(
    { projectId, queueId, page: 0, limit: 1 },
    { enabled: canEdit },
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const update = api.annotationQueues.update.useMutation();
  const assign = api.annotationQueueAssignments.createMany.useMutation();

  if (
    (!queue.data && queue.isError) ||
    (canEdit &&
      ((!configs.data && configs.isError) || (!queues.data && queues.isError)))
  ) {
    return renderLayout(
      <div className="flex flex-col gap-2 p-3">
        <p role="alert">Could not load queue setup.</p>
        <Button
          text="Retry"
          variant="secondary"
          onClick={() => {
            queue.refetch();
            configs.refetch();
            queues.refetch();
          }}
        />
      </div>,
    );
  }
  if (
    !queue.data ||
    !queue.isFetchedAfterMount ||
    (canEdit && (!configs.data || !configs.isFetchedAfterMount || !queues.data))
  ) {
    return renderLayout(
      <div className="w-full p-3">
        <Skeleton className="h-64 w-full" />
      </div>,
    );
  }
  if (!canEdit) {
    return renderLayout(
      <AnnotationQueueDetails
        description={queue.data.description ?? null}
        scoreConfigs={queue.data.scoreConfigs}
        editAction={null}
      />,
    );
  }
  return (
    <AnnotationQueueSetupForm
      initialValues={{
        name: queue.data.name ?? "",
        description: queue.data.description ?? "",
        scoreConfigIds: queue.data.scoreConfigs.map((config) => config.id),
        newAssignmentUserIds: [],
      }}
      queueNames={(queues.data ?? [])
        .filter((candidate) => candidate.id !== queueId)
        .map((candidate) => candidate.name)}
      canEdit={canEdit}
      isSubmitting={update.isPending || assign.isPending}
      hasAssignments={hasAssignments}
      renderLayout={renderLayout}
      onSubmit={(values, dirty) =>
        saveQueueSetup({
          projectId,
          queueId,
          values,
          dirty,
          updateQueue: update.mutateAsync,
          assignUsers: assign.mutateAsync,
          onSaved: async () => {
            await Promise.all([
              utils.annotationQueues.invalidate(),
              utils.annotationQueueAssignments.invalidate(),
            ]);
            if (dirty.scoreConfigIds)
              capture("annotation_queues:score_configs_saved", {
                scoreConfigCount: values.scoreConfigIds.length,
              });
          },
        })
      }
      renderAssignments={({ value, onChange }) => (
        <UserAssignmentSection
          projectId={projectId}
          queueId={queueId}
          selectedUserIds={value}
          onChange={onChange}
        />
      )}
    >
      {({ value, onChange, disabled }) => (
        <QueueScoreConfigFields
          projectId={projectId}
          configs={configs.data?.configs ?? []}
          value={value}
          onChange={onChange}
          disabled={disabled}
          warnOnRemoval={items.data?.totalItems !== 0}
        />
      )}
    </AnnotationQueueSetupForm>
  );
}

async function saveQueueSetup({
  projectId,
  queueId,
  values,
  dirty,
  updateQueue,
  assignUsers,
  onSaved,
}: {
  projectId: string;
  queueId: string;
  values: AnnotationQueueSetupValues;
  dirty: AnnotationQueueSetupDirtyFields;
  updateQueue: (
    input: RouterInputs["annotationQueues"]["update"],
  ) => Promise<unknown>;
  assignUsers: (
    input: RouterInputs["annotationQueueAssignments"]["createMany"],
  ) => Promise<unknown>;
  onSaved: () => Promise<void>;
}) {
  if (dirty.name || dirty.description || dirty.scoreConfigIds) {
    await updateQueue({
      projectId,
      queueId,
      ...(dirty.name ? { name: values.name } : {}),
      ...(dirty.description ? { description: values.description } : {}),
      ...(dirty.scoreConfigIds
        ? { scoreConfigIds: values.scoreConfigIds }
        : {}),
    });
  }
  if (values.newAssignmentUserIds.length > 0) {
    await assignUsers({
      projectId,
      queueId,
      userIds: values.newAssignmentUserIds,
    });
  }
  await onSaved();
}
