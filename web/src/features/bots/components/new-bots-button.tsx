import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  Form,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";

import { usePostHog } from "posthog-js/react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { Textarea } from "@/src/components/ui/textarea";
import { Checkbox } from "@/src/components/ui/checkbox";
import router from "next/router";
import { AutoComplete } from "@/src/features/prompts/components/auto-complete";
import { type AutoCompleteOption } from "@/src/features/prompts/components/auto-complete";
import { JsonForms } from "@jsonforms/react";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

export const CreateBotDialog = (props: {
  projectId: string;
  title: string;
  botName?: string;
  botConfig?: any;
  subtitle?: string;
  children?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "bots:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{props.children}</DialogTrigger>
      <DialogContent className="max-h-screen overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">
            {props.title}
            {props.subtitle ? (
              <p className="mt-3 text-sm	font-normal">{props.subtitle}</p>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <NewBotForm
          projectId={props.projectId}
          botName={props.botName}
          botConfig={props.botConfig}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

const formSchema = z.object({
  name: z.string().min(1, "Enter a name"),
  isActive: z.boolean({
    required_error: "Enter whether the prompt should go live",
  }),
  taskId: z.string().min(1, "Select a task"),
  config: z.any(),
  description: z.string(),
});

export const NewBotForm = (props: {
  projectId: string;
  onFormSuccess?: () => void;
  botName?: string;
  botConfig?: any;
}) => {
  const [formError, setFormError] = useState<string | null>(null);

  const posthog = usePostHog();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isActive: false,
      name: props.botName ?? "",
      config: props.botConfig,
    },
  });

  const bots = api.bots.all.useQuery({
    projectId: props.projectId,
  });

  const tasks = api.tasks.all.useQuery({
    projectId: props.projectId,
  });

  const taskId = form.watch("taskId");

  const selectedTask = tasks.data?.find((task) => task.id === taskId);

  console.log(selectedTask, taskId);

  const utils = api.useUtils();

  const createBotMutation = api.bots.create.useMutation({
    onSuccess: () => utils.bots.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  const comboboxOptions =
    bots.data
      ?.map((bot) => {
        return { label: bot.name, value: bot.name };
      })
      .filter(
        (bot, i, arr) => arr.findIndex((t) => t.label === bot.label) === i,
      ) ?? [];

  const currentName = form.watch("name");
  const existingBot = bots.data?.find((bot) => bot.name === currentName);

  console.log("currentName", currentName);

  const matchingOptions = comboboxOptions.filter((option) =>
    option.label.toLowerCase().includes(currentName.toLowerCase()),
  );

  const promptIsActivated = form.watch("isActive");

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("bots:new_bot_form_submit");

    createBotMutation
      .mutateAsync({
        ...values,
        projectId: props.projectId,
        name: values.name,
        isActive: values.isActive,
        taskId: values.taskId,
        config: values.config,
      })
      .then((newBot) => {
        props.onFormSuccess?.();
        form.reset();
        // go to the following page after creating the prompt
        void router.push(
          `/project/${props.projectId}/bots/${encodeURIComponent(newBot.name)}`,
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }

  if (!tasks.data) {
    return <div>You must first register a task before creating a bot.</div>;
  }

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => {
            const setNameValue = (value: AutoCompleteOption) => {
              field.onChange(value.value);

              const currentBot = bots.data?.find(
                (bot) => bot.name === value.value,
              );
              if (currentBot) {
                form.setValue("taskId", currentBot.taskId);
                form.setValue("description", currentBot.description);
              }
            };

            return (
              <div>
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <AutoComplete
                      {...field}
                      options={matchingOptions}
                      placeholder="Select a Bot"
                      onValueChange={setNameValue}
                      value={{ value: field.value, label: field.value }}
                      disabled={false}
                      createLabel="Create a new Bot"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>
            );
          }}
        />

        {!existingBot && currentName ? (
          <FormField
            control={form.control}
            name="taskId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Task</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => form.setValue("taskId", value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Task" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tasks.data.map((task) => (
                      <SelectItem value={task.id} key={task.name}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {currentName ? (
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <>
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      className="min-h-[150px] flex-1 font-mono text-xs"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </>
            )}
          />
        ) : null}
        {selectedTask ? (
          <FormField
            control={form.control}
            name="config"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Configuration</FormLabel>
                <FormControl>
                  <JsonForms
                    schema={selectedTask.botSchema.schema as any}
                    data={field.value}
                    onChange={({ data }) => field.onChange(data)}
                    renderers={materialRenderers}
                    cells={materialCells}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {currentName && !existingBot ? (
          <FormField
            control={form.control}
            name="isActive"
            disabled={!!existingBot || !currentName}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox
                    disabled={!!existingBot || !currentName}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Activate Bot</FormLabel>
                </div>
                {promptIsActivated ? (
                  <div className="text-xs text-gray-500">
                    Activating the bot will make it available to the SDKs
                    immediately.
                  </div>
                ) : null}
              </FormItem>
            )}
          />
        ) : null}
        <Button
          type="submit"
          loading={createBotMutation.isLoading}
          disabled={!currentName}
          className="w-full"
        >
          Create Bot
        </Button>
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
