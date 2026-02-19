import { Button, type ButtonProps } from "@/src/components/ui/button";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form } from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import {
  type CreateQueueWithAssignments,
  CreateQueueWithAssignmentsData,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { ActionButton } from "@/src/components/ActionButton";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";

export const CreateOrEditAnnotationQueueButton = ({
  projectId,
  queueId,
  variant = "secondary",
  size,
}: {
  projectId: string;
  queueId?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
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
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId as string },
    { enabled: !!queueId && hasQueueAccess },
  );

  const form = useForm({
    resolver: zodResolver(CreateQueueWithAssignmentsData),
  });

  useEffect(() => {
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
  }, [queueId, queueQuery.data]);

  const utils = api.useUtils();

  const createQueueMutation = api.annotationQueues.create.useMutation();
  const editQueueMutation = api.annotationQueues.update.useMutation();
  const createQueueAssignmentsMutation =
    api.annotationQueueAssignments.createMany.useMutation();

  const queueCountData = api.annotationQueues.count.useQuery(
    { projectId },
    { enabled: hasQueueAccess },
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

  const configs = configsData.data?.configs ?? [];

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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <ActionButton
          variant={variant}
          onClick={() => setIsOpen(true)}
          className="justify-start"
          icon={
            queueId ? (
              <Edit className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            )
          }
          hasAccess={hasQueueAccess}
          limitValue={queueCountData.data}
          limit={queueLimit}
          size={size}
        >
          <span className="ml-1 text-sm font-normal">
            {queueId ? "Edit" : "New queue"}
          </span>
        </ActionButton>
      </DialogTrigger>
      {configsData.data && (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {queueId ? "Edit" : "New"} annotation queue
            </DialogTitle>
            <DialogDescription>
              {queueId ? "Edit" : "Create a new"} queue to manage your
              annotation workflows.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <DialogBody>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          className="text-xs"
                          onBlur={(e) =>
                            field.onChange(e.target.value.trimEnd())
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Add description..."
                          className="text-xs focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="scoreConfigIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Score Configs</FormLabel>
                      <FormDescription>
                        Define which dimensions annotators should score for the
                        given queue.
                      </FormDescription>
                      <FormControl>
                        <MultiSelectKeyValues
                          placeholder="Value"
                          align="end"
                          variant="outline"
                          className="grid grid-cols-[auto,1fr,auto,auto] gap-2"
                          onValueChange={handleOnValueChange}
                          options={configs
                            .filter((config) => !config.isArchived)
                            .map((config) => ({
                              key: config.id,
                              value: `${getScoreDataTypeIcon(config.dataType)} ${config.name}`,
                              isArchived: config.isArchived,
                            }))}
                          values={field.value.map((configId) => {
                            const config = configs.find(
                              (config) => config.id === configId,
                            );
                            return {
                              value: config
                                ? `${getScoreDataTypeIcon(config.dataType)} ${config.name}`
                                : `${configId}`,
                              key: configId,
                            };
                          })}
                          controlButtons={
                            <DropdownMenuItem
                              onSelect={() => {
                                capture(
                                  "score_configs:manage_configs_item_click",
                                  { source: "AnnotationQueue" },
                                );
                                router.push(
                                  `/project/${projectId}/settings/scores`,
                                );
                              }}
                            >
                              Manage score configs
                            </DropdownMenuItem>
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Advanced Section */}
                <FormField
                  control={form.control}
                  name="newAssignmentUserIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Advanced Settings</FormLabel>
                      <div className="mt-1 rounded-md border">
                        <Collapsible
                          open={isAdvancedOpen && hasQueueAssignmentsReadAccess}
                          onOpenChange={(open) => {
                            if (!hasQueueAssignmentsReadAccess) {
                              setIsAdvancedOpen(false);
                            } else {
                              setIsAdvancedOpen(open);
                            }
                          }}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              className="group flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-transparent"
                            >
                              <div className="flex items-center gap-2">
                                {isAdvancedOpen ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="text-sm font-medium">
                                  User Assignment
                                </span>
                              </div>
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="border-t border-border/20 px-3 pb-3 pt-1">
                            {hasQueueAssignmentsReadAccess && (
                              <>
                                <FormControl>
                                  <UserAssignmentSection
                                    projectId={projectId}
                                    queueId={queueId}
                                    selectedUserIds={field.value}
                                    onChange={field.onChange}
                                  />
                                </FormControl>
                                <FormMessage />
                              </>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </FormItem>
                  )}
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="submit"
                  className="text-xs"
                  disabled={
                    !!form.formState.errors.name ||
                    createQueueMutation.isPending ||
                    editQueueMutation.isPending ||
                    createQueueAssignmentsMutation.isPending
                  }
                >
                  {createQueueMutation.isPending ||
                  editQueueMutation.isPending ||
                  createQueueAssignmentsMutation.isPending
                    ? "Processing..."
                    : `${queueId ? "Save" : "Create"} queue`}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  );
};
