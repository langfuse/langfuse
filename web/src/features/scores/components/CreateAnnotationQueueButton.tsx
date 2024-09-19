import { Button } from "@/src/components/ui/button";
import React, { useState } from "react";
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
import { LockIcon, PlusIcon } from "lucide-react";
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

export const CreateAnnotationQueueButton = ({
  projectId,
}: {
  projectId: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "scoreConfigs:CUD",
  });

  const form = useForm<CreateQueue>({
    resolver: zodResolver(CreateQueueData),
    defaultValues: {
      name: "",
      scoreConfigs: [],
    },
  });

  const utils = api.useUtils();

  const createQueueMutation = api.annotationQueues.create.useMutation({
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
      <Button variant="secondary" disabled={true}>
        <LockIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" /> New
        queue
      </Button>
    );
  }

  const onSubmit = (data: CreateQueue) => {
    createQueueMutation.mutateAsync({
      ...data,
      projectId,
    });
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
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
          New queue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new annotation queue</DialogTitle>
          <DialogDescription>
            Create a new queue to manage your annotation workflows.
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="text-xs">
              Create Queue
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
