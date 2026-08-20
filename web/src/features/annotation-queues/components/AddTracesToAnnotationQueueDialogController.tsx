import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ActionId, BatchExportTableName } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { AddTracesToAnnotationQueueSelectDialogContent } from "@/src/features/annotation-queues/components/AddTracesToAnnotationQueueSelectDialogContent";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";

type AddTracesToAnnotationQueueDialogControllerProps = {
  projectId: string;
  onSuccess: () => void;
  description: string;
  onAddToQueue: (params: {
    projectId: string;
    targetId: string;
  }) => Promise<void>;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
};

export function AddTracesToAnnotationQueueDialogController({
  projectId,
  onSuccess,
  description,
  onAddToQueue,
  children,
}: AddTracesToAnnotationQueueDialogControllerProps) {
  const [open, setOpen] = useState(false);
  const [isCompletingAction, setIsCompletingAction] = useState(false);

  const hasQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");
  const disabled = hasQueueAccess
    ? undefined
    : {
        reason: "You don't have permission to add traces to annotation queues.",
      };
  const openDialog = () => {
    if (!hasQueueAccess) return;
    setOpen(true);
  };

  const selectForm = useForm({ defaultValues: { targetId: "" } });
  const queueOptionsQuery = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: open && hasQueueAccess },
  );

  const queueCountQuery = api.annotationQueues.count.useQuery(
    { projectId },
    { enabled: open && hasQueueAccess },
  );

  const isInProgress = api.table.getIsBatchActionInProgress.useQuery(
    {
      projectId,
      tableName: BatchExportTableName.Traces,
      actionId: ActionId.TraceAddToAnnotationQueue,
    },
    {
      enabled: open,
      refetchInterval: 2 * 60 * 1000,
    },
  );

  useEffect(() => {
    if (!open) return;
    setIsCompletingAction(false);
    selectForm.reset({ targetId: "" });
  }, [open, selectForm]);

  useEffect(() => {
    const options = queueOptionsQuery.data;
    if (options?.length === 1 && !selectForm.getValues().targetId) {
      selectForm.setValue("targetId", options[0].id);
    }
  }, [queueOptionsQuery.data, selectForm]);

  const atQueueLimit =
    typeof queueLimit === "number" &&
    typeof queueCountQuery.data === "number" &&
    queueCountQuery.data >= queueLimit;

  const createQueueState = !hasQueueAccess
    ? ({
        status: "disabled",
        reason: "You don't have permission to create annotation queues.",
      } as const)
    : atQueueLimit
      ? ({
          status: "disabled",
          reason: "Maximum number of annotation queues reached for your plan.",
        } as const)
      : ({ status: "enabled" } as const);

  const handleSelectSubmit = async () => {
    const targetId = selectForm.getValues().targetId;
    if (!targetId) return;

    setIsCompletingAction(true);
    try {
      await onAddToQueue({ projectId, targetId });
      onSuccess();
      setOpen(false);
    } finally {
      setIsCompletingAction(false);
    }
  };

  return (
    <AnnotationQueueFormDialogController
      mode="create"
      projectId={projectId}
      onSuccess={(queueId) => selectForm.setValue("targetId", queueId)}
    >
      {({ openDialog: openCreateDialog }) => (
        <Dialog open={hasQueueAccess && open} onOpenChange={setOpen}>
          {children({ disabled, openDialog })}
          <DialogContent className="sm:max-w-md">
            <AddTracesToAnnotationQueueSelectDialogContent
              description={description}
              form={selectForm}
              queueOptionsState={
                queueOptionsQuery.isLoading
                  ? { status: "loading" }
                  : {
                      status: "ready",
                      options: queueOptionsQuery.data ?? [],
                    }
              }
              onSubmit={handleSelectSubmit}
              onCreateNewQueue={openCreateDialog}
              createQueueState={createQueueState}
              hasAccess={hasQueueAccess}
              batchActionState={
                isInProgress.isLoading || isCompletingAction
                  ? { status: "checking" }
                  : isInProgress.data
                    ? { status: "inProgress" }
                    : {
                        status: "ready",
                        canConfirm: !!selectForm.watch("targetId"),
                      }
              }
            />
          </DialogContent>
        </Dialog>
      )}
    </AnnotationQueueFormDialogController>
  );
}
