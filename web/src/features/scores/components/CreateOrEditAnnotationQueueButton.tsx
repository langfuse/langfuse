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
import { Edit, LockIcon, PlusIcon } from "lucide-react";
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
  const capture = usePostHogClientCapture();

  const queueQuery = api.annotationQueues.byId.useQuery(
    { projectId, queueId: queueId as string },
    { enabled: !!queueId },
  );

  const form = useForm<CreateQueue>({
    resolver: zodResolver(CreateQueueData),
  });

  useEffect(() => {
    if (queueId && queueQuery.data) {
      form.reset({
        name: queueQuery.data.name,
        description: queueQuery.data.description || undefined,
        scoreConfigs: queueQuery.data.scoreConfigs.map(
          (config: ValidatedScoreConfig) => config.id,
        ),
      });
    } else {
      form.reset({
        name: "",
        scoreConfigs: [],
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
        <span className="text-sm font-normal">
          {queueId ? "Edit" : "New queue"}
        </span>
      </Button>
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
      "scoreConfigs",
      values.map((value) => value.key),
    );

    if (values.length === 0) {
      form.setError("scoreConfigs", {
        type: "manual",
        message: "At least 1 score config must be selected",
      });
    } else {
      form.clearErrors("scoreConfigs");
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
      {configsData.isLoading && hasAccess && isOpen ? (
        <div>Loading...</div>
      ) : (
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
                name="scoreConfigs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Score Configs</FormLabel>
                    <FormDescription>
                      Define which dimensions annotators should score for the
                      given queue.
                    </FormDescription>
                    <FormControl>
                      <MultiSelectKeyValues
                        title="Value"
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
                          ) as ValidatedScoreConfig;
                          return {
                            value: `${getScoreDataTypeIcon(config.dataType)} ${config.name}`,
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
