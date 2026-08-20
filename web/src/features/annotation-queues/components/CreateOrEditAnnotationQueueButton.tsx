/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { type ButtonProps } from "@/src/components/ui/button";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Pen, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import {
  type CreateQueueWithAssignments,
  CreateQueueWithAssignmentsData,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { ActionButton } from "@/src/components/ActionButton";
import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { AnnotationQueueFormContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormContent";

export const CreateOrEditAnnotationQueueButton = ({
  projectId,
  queueId,
  variant = "secondary",
  size,
  isTableAction = false,
}: {
  projectId: string;
  queueId?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  isTableAction?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const hasQueueAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:CUD",
  });
  const hasQueueAssignmentsReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueueAssignments:read",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");
  const capture = usePostHogClientCapture();

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId as string },
    // Only needed once the edit dialog is open; otherwise this fires for every
    // row that eagerly mounts the inline table-action button.
    { enabled: !!queueId && hasQueueAccess && isOpen },
  );

  const form = useForm({
    resolver: zodResolver(CreateQueueWithAssignmentsData),
  });

  useEffect(() => {
    // Re-seed when the dialog opens so reopening discards any unsaved edits;
    // the component now stays mounted per table row instead of remounting.
    if (!isOpen) return;
    if (queueId && queueQuery.data) {
      form.reset({
        name: queueQuery.data.name,
        description: queueQuery.data.description || undefined,
        scoreConfigIds: queueQuery.data.scoreConfigs.map(
          (config: ScoreConfigDomain) => config.id,
        ),
        newAssignmentUserIds: [],
      });
    } else {
      form.reset({
        name: "",
        scoreConfigIds: [],
        newAssignmentUserIds: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, queueQuery.data, isOpen]);

  const utils = api.useUtils();

  const createQueueMutation = api.annotationQueues.create.useMutation();
  const editQueueMutation = api.annotationQueues.update.useMutation();
  const createQueueAssignmentsMutation =
    api.annotationQueueAssignments.createMany.useMutation();

  const queueCountData = api.annotationQueues.count.useQuery(
    { projectId },
    // The count only feeds the create button's limit check; skip it when
    // editing (e.g. the per-row table action button) where it goes unused.
    { enabled: hasQueueAccess && !queueId },
  );

  const configsData = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: hasQueueAccess && isOpen,
    },
  );

  const allQueueNamesAndIds = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: hasQueueAccess && !queueId },
  );

  const allQueueNames = useMemo(() => {
    return !queueId && allQueueNamesAndIds.data
      ? allQueueNamesAndIds.data.map((queue) => ({ value: queue.name }))
      : [];
  }, [allQueueNamesAndIds.data, queueId]);

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: allQueueNames,
    form,
    errorMessage: "Queue name already exists.",
  });

  const onSubmit = async (data: CreateQueueWithAssignments) => {
    try {
      // Step 1: Create or update the queue
      let queueResponse;
      if (queueId) {
        // Update existing queue
        queueResponse = await editQueueMutation.mutateAsync({
          name: data.name,
          description: data.description,
          scoreConfigIds: data.scoreConfigIds,
          projectId,
          queueId,
        });
      } else {
        // Create new queue
        queueResponse = await createQueueMutation.mutateAsync({
          name: data.name,
          description: data.description,
          scoreConfigIds: data.scoreConfigIds,
          projectId,
        });
      }

      // Step 2: Handle assignment if provided
      if (data.newAssignmentUserIds && data.newAssignmentUserIds.length > 0) {
        const targetQueueId = queueId || queueResponse.id;

        await createQueueAssignmentsMutation.mutateAsync({
          projectId,
          queueId: targetQueueId,
          userIds: data.newAssignmentUserIds,
        });
      }

      // Step 3: Success handling
      await Promise.all([
        utils.annotationQueues.invalidate(),
        utils.annotationQueueAssignments.invalidate(),
      ]);
      form.reset();
      setIsOpen(false);

      // capture posthog event
    } catch {
      showErrorToast(
        "Operation failed",
        "Failed to create or update queue or assign users. Please try again.",
      );
    }
  };

  const handleOnValueChange = (values: Record<string, string>[]) => {
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

  // Table rows render a compact icon button and rely on the disabled state plus
  // a tooltip; everywhere else uses the labeled ActionButton with its built-in
  // access/limit messaging.
  const triggerButton = isTableAction ? (
    <IconOnlyButton
      icon={<Pen className="h-4 w-4" />}
      label="Edit"
      aria-label="edit"
      disabledReason={
        hasQueueAccess
          ? undefined
          : "You don't have permission to edit this queue."
      }
      onClick={(event) => {
        event.stopPropagation();
        setIsOpen(true);
      }}
    />
  ) : (
    <ActionButton
      variant={variant}
      onClick={() => setIsOpen(true)}
      icon={
        queueId ? (
          <Edit className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
        )
      }
      hasAccess={hasQueueAccess}
      usageLimit={
        typeof queueLimit === "number"
          ? { current: queueCountData.data, max: queueLimit }
          : undefined
      }
      size={size}
    >
      <span className="ml-1 text-sm font-normal">
        {queueId ? "Edit" : "New queue"}
      </span>
    </ActionButton>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {isTableAction ? (
        triggerButton
      ) : (
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      )}
      {/* For an edit, also wait for the queue data so the form opens populated
          rather than briefly showing empty fields while byId loads. */}
      {configsData.data && (!queueId || queueQuery.data) && (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormContent
            mode={queueId ? "edit" : "create"}
            form={form}
            scoreConfigs={configsData.data.configs}
            projectId={projectId}
            onScoreConfigValueChange={handleOnValueChange}
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
            onSubmit={onSubmit}
          />
        </DialogContent>
      )}
    </Dialog>
  );
};
