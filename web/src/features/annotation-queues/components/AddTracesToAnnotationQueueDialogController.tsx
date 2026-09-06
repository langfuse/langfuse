import { type ReactNode, useState } from "react";
import { ActionId, BatchExportTableName } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { AddTracesToAnnotationQueueSelectDialogContent } from "@/src/features/annotation-queues/components/AddTracesToAnnotationQueueSelectDialogContent";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";
import { useTranslations } from "next-intl";

type AddTracesToAnnotationQueueDialogControllerProps = {
  projectId: string;
  onSuccess: () => void;
  description: string;
  actionId?: ActionId;
  tableName?: BatchExportTableName;
  alternateTableName?: BatchExportTableName;
  objectLabel?: string;
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
  actionId = ActionId.TraceAddToAnnotationQueue,
  tableName = BatchExportTableName.Traces,
  alternateTableName,
  objectLabel,
  onAddToQueue,
  children,
}: AddTracesToAnnotationQueueDialogControllerProps) {
  const t = useTranslations("evaluationAnalytics.annotationQueues");
  const localizedObjectLabel = objectLabel ?? t("traces");
  const [open, setOpen] = useState(false);
  const [newQueueId, setNewQueueId] = useState<string>();

  const hasQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");
  const disabled = hasQueueAccess
    ? undefined
    : {
        reason: t("noAddPermission", { object: localizedObjectLabel }),
      };
  const openDialog = () => {
    if (!hasQueueAccess) return;
    setNewQueueId(undefined);
    setOpen(true);
  };

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
      tableName,
      actionId,
    },
    {
      enabled: open,
      refetchInterval: 2 * 60 * 1000,
    },
  );
  const isAlternateInProgress = api.table.getIsBatchActionInProgress.useQuery(
    {
      projectId,
      tableName: alternateTableName ?? tableName,
      actionId,
    },
    {
      enabled: open && alternateTableName !== undefined,
      refetchInterval: 2 * 60 * 1000,
    },
  );

  const atQueueLimit =
    typeof queueLimit === "number" &&
    typeof queueCountQuery.data === "number" &&
    queueCountQuery.data >= queueLimit;

  const createQueueState = !hasQueueAccess
    ? ({
        status: "disabled",
        reason: t("noCreatePermission"),
      } as const)
    : atQueueLimit
      ? ({
          status: "disabled",
          reason: t("queueLimitReached"),
        } as const)
      : ({ status: "enabled" } as const);

  const handleSelectSubmit = async (targetId: string) => {
    await onAddToQueue({ projectId, targetId });
    onSuccess();
    setOpen(false);
  };

  const queueOptions = queueOptionsQuery.data ?? [];
  const initialTargetId =
    newQueueId ?? (queueOptions.length === 1 ? queueOptions[0].id : "");

  return (
    <AnnotationQueueFormDialogController
      mode="create"
      projectId={projectId}
      onSuccess={setNewQueueId}
    >
      {({ openDialog: openCreateDialog }) => (
        <Dialog open={hasQueueAccess && open} onOpenChange={setOpen}>
          {children({ disabled, openDialog })}
          <DialogContent className="sm:max-w-md">
            {open ? (
              <AddTracesToAnnotationQueueSelectDialogContent
                key={
                  queueOptionsQuery.isLoading
                    ? "loading"
                    : (newQueueId ?? "ready")
                }
                description={description}
                initialTargetId={initialTargetId}
                queueOptionsState={
                  queueOptionsQuery.isLoading
                    ? { status: "loading" }
                    : {
                        status: "ready",
                        options: queueOptions,
                      }
                }
                onSubmit={handleSelectSubmit}
                onCreateNewQueue={openCreateDialog}
                createQueueState={createQueueState}
                hasAccess={hasQueueAccess}
                batchActionState={
                  isInProgress.isLoading || isAlternateInProgress.isLoading
                    ? { status: "checking" }
                    : isInProgress.data || isAlternateInProgress.data
                      ? { status: "inProgress" }
                      : { status: "ready" }
                }
              />
            ) : null}
          </DialogContent>
        </Dialog>
      )}
    </AnnotationQueueFormDialogController>
  );
}
