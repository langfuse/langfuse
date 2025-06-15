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
  type CreateQueue,
  CreateQueueData,
  type ValidatedScoreConfig,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { ActionButton } from "@/src/components/ActionButton";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";

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
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:CUD",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId as string },
    { enabled: !!queueId && hasAccess },
  );

  const form = useForm({
    resolver: zodResolver(CreateQueueData),
  });

  useEffect(() => {
    if (queueId && queueQuery.data) {
      form.reset({
        name: queueQuery.data.name,
        description: queueQuery.data.description || undefined,
        scoreConfigIds: queueQuery.data.scoreConfigs.map(
          (config: ValidatedScoreConfig) => config.id,
        ),
      });
    } else {
      form.reset({
        name: "",
        scoreConfigIds: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, queueQuery.data]);

  const utils = api.useUtils();

  const createQueueMutation = api.annotationQueues.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.annotationQueues.invalidate()]);
      form.reset();
      setIsOpen(false);
    },
  });
  const editQueueMutation = api.annotationQueues.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.annotationQueues.invalidate()]);
      form.reset();
      setIsOpen(false);
    },
  });

  const queueCountData = api.annotationQueues.count.useQuery(
    { projectId },
    { enabled: hasAccess },
  );

  const configsData = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: hasAccess && isOpen,
    },
  );

  const allQueueNamesAndIds = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: hasAccess && !queueId },
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

  const onSubmit = (data: CreateQueue) => {
    if (queueId) {
      editQueueMutation.mutateAsync({
        ...data,
        projectId,
        queueId,
      });
    } else {
      createQueueMutation.mutateAsync({
        ...data,
        projectId,
      });
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
          hasAccess={hasAccess}
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
              </DialogBody>
              <DialogFooter>
                <Button
                  type="submit"
                  className="text-xs"
                  disabled={!!form.formState.errors.name}
                >
                  {queueId ? "Save" : "Create"} queue
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  );
};
