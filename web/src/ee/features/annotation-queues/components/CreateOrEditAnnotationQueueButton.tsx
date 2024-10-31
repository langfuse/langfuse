import { Button } from "@/src/components/ui/button";
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { CircleAlert, Edit, LockIcon, PlusIcon } from "lucide-react";
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
import { CommandItem } from "@/src/components/ui/command";
import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useOrganizationPlan } from "@/src/features/entitlements/hooks";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

export const CreateOrEditAnnotationQueueButton = ({
  projectId,
  queueId,
  variant = "secondary",
}: {
  projectId: string;
  queueId?: string;
  variant?: "secondary" | "ghost";
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:CUD",
  });
  const router = useRouter();
  const plan = useOrganizationPlan();
  const capture = usePostHogClientCapture();

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId as string },
    { enabled: !!queueId && hasAccess },
  );

  const form = useForm<CreateQueue>({
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

  const configs = configsData.data?.configs ?? [];

  if (!hasAccess) {
    return (
      <Button variant={variant} disabled={true} className="justify-start">
        <LockIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
        <span className="text-sm">{queueId ? "Edit" : "New queue"}</span>
      </Button>
    );
  }

  if (queueCountData.isLoading) return null;

  // gate cloud hobby usage of annotation queue
  if (plan === "cloud:hobby" && !!queueCountData.data && !queueId) {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button
            variant={variant}
            className="relative grid grid-flow-row items-start justify-start overflow-hidden py-0 disabled:cursor-default"
            disabled
          >
            <div className="mt-2 flex h-6 flex-row items-center justify-center">
              <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
              <span className="text-sm">New queue</span>
            </div>
            <div className="absolute top-0 flex h-3 w-full items-center justify-center bg-primary-accent">
              <CircleAlert
                className="mr-1 h-2 w-2 text-white"
                aria-hidden="true"
              />
              <span className="text-xs text-white">At usage limit</span>
            </div>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent className="w-80" align="start" side="right">
          <div className="flex justify-between space-x-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Usage Limit Reached</h4>
              <p className="text-xs">
                You have reached the maximum number of annotation queues allowed
                on the Hobby plan. Upgrade your plan to create more queues.
              </p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

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
        <Button
          variant={variant}
          onClick={() => setIsOpen(true)}
          className="justify-start"
        >
          {queueId ? (
            <Edit className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
          ) : (
            <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          <span className="ml-1 text-sm font-normal">
            {queueId ? "Edit" : "New queue"}
          </span>
        </Button>
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
                        onBlur={(e) => field.onChange(e.target.value.trimEnd())}
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
                        emptyPlaceholder="Value"
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
                          <CommandItem
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
                          </CommandItem>
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="text-xs">
                {queueId ? "Save" : "Create"} queue
              </Button>
            </form>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  );
};
