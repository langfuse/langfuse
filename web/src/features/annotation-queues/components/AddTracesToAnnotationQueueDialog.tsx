import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ActionId,
  BatchExportTableName,
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { AnnotationQueueFormContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormContent";
import { AddTracesToAnnotationQueueSelectContent } from "@/src/features/annotation-queues/components/AddTracesToAnnotationQueueSelectContent";
import { Button } from "@/src/components/ui/button";
import { ChevronLeft } from "lucide-react";

type AddTracesToAnnotationQueueDialogProps = {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  description: string;
  onAddToQueue: (params: {
    projectId: string;
    targetId: string;
  }) => Promise<void>;
};

type DialogStep = "select" | "create";

export function AddTracesToAnnotationQueueDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  description,
  onAddToQueue,
}: AddTracesToAnnotationQueueDialogProps) {
  const [step, setStep] = useState<DialogStep>("select");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const capture = usePostHogClientCapture();

  const hasQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueueAssignments:read",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");

  const selectForm = useForm({ defaultValues: { targetId: "" } });
  const createForm = useForm({
    resolver: zodResolver(CreateQueueWithAssignmentsData),
    defaultValues: {
      name: "",
      scoreConfigIds: [] as string[],
      newAssignmentUserIds: [] as string[],
    },
  });

  const utils = api.useUtils();

  const queueOptionsQuery = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: isOpen && hasQueueAccess },
  );

  const queueCountQuery = api.annotationQueues.count.useQuery(
    { projectId },
    { enabled: isOpen && hasQueueAccess },
  );

  const scoreConfigsQuery = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: isOpen && hasQueueAccess && step === "create" },
  );

  const isInProgress = api.table.getIsBatchActionInProgress.useQuery(
    {
      projectId,
      tableName: BatchExportTableName.Traces,
      actionId: ActionId.TraceAddToAnnotationQueue,
    },
    {
      enabled: isOpen,
      refetchInterval: 2 * 60 * 1000,
    },
  );

  const createQueueMutation = api.annotationQueues.create.useMutation();
  const createQueueAssignmentsMutation =
    api.annotationQueueAssignments.createMany.useMutation();

  const allQueueNames = useMemo(
    () => queueOptionsQuery.data?.map((queue) => ({ value: queue.name })) ?? [],
    [queueOptionsQuery.data],
  );

  useUniqueNameValidation({
    currentName: createForm.watch("name"),
    allNames: allQueueNames,
    form: createForm,
    errorMessage: "Queue name already exists.",
  });

  useEffect(() => {
    if (!isOpen) return;
    setStep("select");
    setIsAdvancedOpen(false);
    selectForm.reset({ targetId: "" });
    createForm.reset({
      name: "",
      scoreConfigIds: [],
      newAssignmentUserIds: [],
    });
  }, [isOpen, selectForm, createForm]);

  useEffect(() => {
    const options = queueOptionsQuery.data;
    if (
      step === "select" &&
      options?.length === 1 &&
      !selectForm.getValues().targetId
    ) {
      selectForm.setValue("targetId", options[0].id);
    }
  }, [queueOptionsQuery.data, selectForm, step]);

  const atQueueLimit =
    typeof queueLimit === "number" &&
    typeof queueCountQuery.data === "number" &&
    queueCountQuery.data >= queueLimit;

  const canCreateQueue = hasQueueAccess && !atQueueLimit;
  const createQueueDisabledReason = !hasQueueAccess
    ? "You don't have permission to create annotation queues."
    : atQueueLimit
      ? "Maximum number of annotation queues reached for your plan."
      : undefined;

  const handleSelectSubmit = async () => {
    const targetId = selectForm.getValues().targetId;
    if (!targetId) return;

    await onAddToQueue({ projectId, targetId });
    onSuccess();
    onClose();
  };

  const handleScoreConfigValueChange = (values: Record<string, string>[]) => {
    createForm.setValue(
      "scoreConfigIds",
      values.map((value) => value.key),
    );

    if (values.length === 0) {
      createForm.setError("scoreConfigIds", {
        type: "manual",
        message: "At least 1 score config must be selected",
      });
    } else {
      createForm.clearErrors("scoreConfigIds");
    }
  };

  const handleCreateSubmit = async (data: CreateQueueWithAssignments) => {
    try {
      const queueResponse = await createQueueMutation.mutateAsync({
        name: data.name,
        description: data.description,
        scoreConfigIds: data.scoreConfigIds,
        projectId,
      });

      if (data.newAssignmentUserIds.length > 0) {
        await createQueueAssignmentsMutation.mutateAsync({
          projectId,
          queueId: queueResponse.id,
          userIds: data.newAssignmentUserIds,
        });
      }

      await Promise.all([
        utils.annotationQueues.invalidate(),
        utils.annotationQueueAssignments.invalidate(),
      ]);

      await onAddToQueue({ projectId, targetId: queueResponse.id });
      onSuccess();
      onClose();
    } catch {
      showErrorToast(
        "Operation failed",
        "Failed to create queue or add traces. Please try again.",
      );
    }
  };

  const isCreateSubmitting =
    createQueueMutation.isPending || createQueueAssignmentsMutation.isPending;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={
          step === "create"
            ? "max-h-[90vh] overflow-y-auto sm:max-w-lg"
            : "sm:max-w-md"
        }
      >
        {step === "select" ? (
          <AddTracesToAnnotationQueueSelectContent
            description={description}
            form={selectForm}
            queueOptions={queueOptionsQuery.data ?? []}
            isQueueOptionsLoading={queueOptionsQuery.isLoading}
            onSubmit={handleSelectSubmit}
            onCreateNewQueue={() => setStep("create")}
            canCreateQueue={canCreateQueue}
            createQueueDisabledReason={createQueueDisabledReason}
            hasAccess={hasQueueAccess}
            isBatchActionInProgress={!!isInProgress.data}
            isConfirmLoading={isInProgress.isLoading}
            isConfirmDisabled={
              !!isInProgress.data || !selectForm.watch("targetId")
            }
          />
        ) : (
          <>
            <div className="mb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setStep("select")}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </div>
            {scoreConfigsQuery.data ? (
              <AnnotationQueueFormContent
                mode="create"
                form={createForm}
                scoreConfigs={scoreConfigsQuery.data.configs}
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
                    selectedUserIds={createForm.watch("newAssignmentUserIds")}
                    onChange={(userIds) =>
                      createForm.setValue("newAssignmentUserIds", userIds)
                    }
                  />
                }
                isSubmitting={isCreateSubmitting}
                onSubmit={handleCreateSubmit}
                submitLabel="Create queue and add traces"
              />
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
