import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { AddTracesToAnnotationQueueSelectDialogContent } from "@/src/features/annotation-queues/components/AddTracesToAnnotationQueueSelectDialogContent";
import { Button } from "@/src/components/ui/button";
import { ChevronLeft } from "lucide-react";

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

type DialogStep = "select" | "create";

export function AddTracesToAnnotationQueueDialogController({
  projectId,
  onSuccess,
  description,
  onAddToQueue,
  children,
}: AddTracesToAnnotationQueueDialogControllerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("select");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isCompletingAction, setIsCompletingAction] = useState(false);
  const createProgressRef = useRef<{
    queueId: string;
    assignmentsCreated: boolean;
  } | null>(null);
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
    { enabled: open && hasQueueAccess },
  );

  const queueCountQuery = api.annotationQueues.count.useQuery(
    { projectId },
    { enabled: open && hasQueueAccess },
  );

  const scoreConfigsQuery = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: open && hasQueueAccess && step === "create" },
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
    if (!open) return;
    setStep("select");
    setIsAdvancedOpen(false);
    setIsCompletingAction(false);
    createProgressRef.current = null;
    selectForm.reset({ targetId: "" });
    createForm.reset({
      name: "",
      scoreConfigIds: [],
      newAssignmentUserIds: [],
    });
  }, [open, selectForm, createForm]);

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
    setIsCompletingAction(true);
    try {
      let progress = createProgressRef.current;
      if (!progress) {
        const queueResponse = await createQueueMutation.mutateAsync({
          name: data.name,
          description: data.description,
          scoreConfigIds: data.scoreConfigIds,
          projectId,
        });
        progress = {
          queueId: queueResponse.id,
          assignmentsCreated: data.newAssignmentUserIds.length === 0,
        };
        createProgressRef.current = progress;
      }

      if (!progress.assignmentsCreated) {
        await createQueueAssignmentsMutation.mutateAsync({
          projectId,
          queueId: progress.queueId,
          userIds: data.newAssignmentUserIds,
        });
        progress.assignmentsCreated = true;
      }

      await Promise.all([
        utils.annotationQueues.invalidate(),
        utils.annotationQueueAssignments.invalidate(),
      ]);

      await onAddToQueue({ projectId, targetId: progress.queueId });
      onSuccess();
      setOpen(false);
    } catch {
      showErrorToast(
        "Operation failed",
        createProgressRef.current
          ? "The queue was created, but setup or adding traces failed. Please try again."
          : "Failed to create queue. Please try again.",
      );
    } finally {
      setIsCompletingAction(false);
    }
  };

  const isCreateSubmitting =
    isCompletingAction ||
    createQueueMutation.isPending ||
    createQueueAssignmentsMutation.isPending;

  return (
    <Dialog open={hasQueueAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
      <DialogContent
        className={
          step === "create"
            ? "max-h-[90vh] overflow-y-auto sm:max-w-lg"
            : "sm:max-w-md"
        }
      >
        {step === "select" ? (
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
            onCreateNewQueue={() => setStep("create")}
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
              <AnnotationQueueFormDialogContent
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
