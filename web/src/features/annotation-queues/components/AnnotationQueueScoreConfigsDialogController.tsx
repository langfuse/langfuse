import { type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { AnnotationQueueScoreConfigsDialogContent } from "./AnnotationQueueScoreConfigsDialogContent";
import { QueueScoreConfigFields } from "./QueueScoreConfigFields";

export function AnnotationQueueScoreConfigsDialogController({
  projectId,
  queueId,
  children,
}: {
  projectId: string;
  queueId: string;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  return (
    <DialogController
      renderDialog={({ closeDialog, isOpen }) =>
        hasAccess ? (
          <QueueScoreConfigsData
            projectId={projectId}
            queueId={queueId}
            isOpen={isOpen}
            closeDialog={closeDialog}
          />
        ) : null
      }
    >
      {({ openDialog }) =>
        children({
          disabled: hasAccess
            ? undefined
            : {
                reason: "You don't have permission to edit annotation queues.",
              },
          openDialog: () => {
            if (hasAccess) openDialog();
          },
        })
      }
    </DialogController>
  );
}

function QueueScoreConfigsData({
  projectId,
  queueId,
  isOpen,
  closeDialog,
}: {
  projectId: string;
  queueId: string;
  isOpen: boolean;
  closeDialog: () => void;
}) {
  const queue = api.annotationQueues.byId.useQuery(
    { projectId, queueId },
    { enabled: isOpen, refetchOnMount: "always" },
  );
  const configs = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: isOpen, refetchOnMount: "always" },
  );
  const items = api.annotationQueueItems.itemsByQueueId.useQuery(
    { projectId, queueId, page: 0, limit: 1 },
    { enabled: isOpen },
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const mutation = api.annotationQueues.update.useMutation({
    onSuccess: async (_, input) => {
      await utils.annotationQueues.invalidate();
      capture("annotation_queues:score_configs_saved", {
        scoreConfigCount: input.scoreConfigIds?.length ?? 0,
      });
      closeDialog();
    },
  });
  if ((!queue.data && queue.isError) || (!configs.data && configs.isError)) {
    return (
      <Dialog title="Edit score configs">
        <Dialog.Body>
          <p role="alert">Could not load score configs. Please try again.</p>
          <Button
            text="Retry"
            variant="secondary"
            onClick={() => {
              queue.refetch();
              configs.refetch();
            }}
          />
        </Dialog.Body>
      </Dialog>
    );
  }
  if (
    !queue.data ||
    !configs.data ||
    !queue.isFetchedAfterMount ||
    !configs.isFetchedAfterMount
  ) {
    return (
      <Dialog title="Edit score configs">
        <Dialog.Body>
          <Skeleton className="h-64 w-full" />
        </Dialog.Body>
      </Dialog>
    );
  }
  return (
    <AnnotationQueueScoreConfigsDialogContent
      initialValue={queue.data.scoreConfigs.map((config) => config.id)}
      isSubmitting={mutation.isPending}
      onSubmit={(scoreConfigIds) =>
        mutation.mutate({ projectId, queueId, scoreConfigIds })
      }
    >
      {({ value, onChange }) => (
        <QueueScoreConfigFields
          projectId={projectId}
          configs={configs.data.configs}
          value={value}
          onChange={onChange}
          disabled={mutation.isPending}
          warnOnRemoval={items.data?.totalItems !== 0}
        />
      )}
    </AnnotationQueueScoreConfigsDialogContent>
  );
}
