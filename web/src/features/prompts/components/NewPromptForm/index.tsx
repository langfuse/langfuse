import { capitalize } from "lodash";
import router from "next/router";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { ControllerRenderProps, useForm } from "react-hook-form";
import JsonView from "react18-json-view";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { AutoComplete } from "@/src/features/prompts/components/auto-complete";
import {
  CreatePromptTRPCType,
  PromptType,
} from "@/src/features/prompts/server/validation";
import useProjectId from "@/src/hooks/useProjectId";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { jsonSchema } from "@/src/utils/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Prompt } from "@langfuse/shared/src/db";

import { PromptChatMessages } from "./PromptChatMessages";
import {
  NewPromptFormSchema,
  NewPromptFormSchemaType,
  PromptContentSchema,
  PromptContentType,
} from "./validation";

type NewPromptFormProps = {
  initialPrompt?: Prompt | null;
  onFormSuccess?: () => void;
};

export const NewPromptForm: React.FC<NewPromptFormProps> = (props) => {
  const { onFormSuccess, initialPrompt } = props;
  const projectId = useProjectId();
  const [formError, setFormError] = useState<string | null>(null);
  const utils = api.useUtils();
  const posthog = usePostHog();

  let initialPromptContent: PromptContentType | null;
  try {
    initialPromptContent = PromptContentSchema.parse({
      type: initialPrompt?.type,
      prompt: initialPrompt?.prompt?.valueOf(),
    });
  } catch (err) {
    initialPromptContent = null;
  }

  const defaultValues: NewPromptFormSchemaType = {
    type: initialPromptContent?.type ?? PromptType.Text,
    chatPrompt:
      initialPromptContent?.type === PromptType.Chat
        ? initialPromptContent?.prompt
        : [],
    textPrompt:
      initialPromptContent?.type === PromptType.Text
        ? initialPromptContent?.prompt
        : "",
    name: initialPrompt?.name ?? "",
    config: JSON.stringify(initialPrompt?.config?.valueOf()) || "{}",
    isActive: false,
  };

  const form = useForm<NewPromptFormSchemaType>({
    resolver: zodResolver(NewPromptFormSchema),
    defaultValues,
  });

  const currentName = form.watch("name");
  const currentType = form.watch("type");
  const currentIsActive = form.watch("isActive");
  const currentExtractedVariables = extractVariables(
    currentType === PromptType.Text
      ? form.watch("textPrompt")
      : JSON.stringify(form.watch("chatPrompt"), null, 2),
  );

  const createPromptMutation = api.prompts.create.useMutation({
    onSuccess: () => utils.prompts.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  const allPrompts = api.prompts.all.useQuery({ projectId }).data;

  // Remove duplicate prompt names
  const comboboxOptions = [
    ...new Map(
      (allPrompts ?? []).map((item) => [
        item.name,
        { label: item.name, value: item.name },
      ]),
    ).values(),
  ];

  // Filter prompt names based on user input
  const matchingOptions = currentName
    ? comboboxOptions.filter((option) =>
        option.label.toLowerCase().includes(currentName.toLowerCase()),
      )
    : comboboxOptions;

  function onSubmit(values: NewPromptFormSchemaType) {
    posthog.capture("prompts:new_prompt_form_submit");

    const { type, textPrompt, chatPrompt } = values;

    // TS does not narrow down type of 'prompt' property given the type of 'type' property in ternary operator
    let newPrompt: CreatePromptTRPCType;
    if (type === PromptType.Chat) {
      newPrompt = {
        ...values,
        projectId,
        type,
        prompt: chatPrompt,
        config: JSON.parse(values.config),
      };
    } else {
      newPrompt = {
        ...values,
        projectId,
        type,
        prompt: textPrompt,
        config: JSON.parse(values.config),
      };
    }

    createPromptMutation
      .mutateAsync(newPrompt)
      .then((newPrompt) => {
        onFormSuccess?.();
        form.reset();
        void router.push(
          `/project/${projectId}/prompts/${encodeURIComponent(newPrompt.name)}`,
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        {/* Prompt name field - text vs. chat */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => {
            return (
              <div>
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <AutoComplete
                      {...field}
                      options={matchingOptions}
                      placeholder="Select a prompt name"
                      onValueChange={({ value }) => field.onChange(value)}
                      value={{ value: field.value, label: field.value }}
                      disabled={false}
                      createLabel="Create a new prompt name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>
            );
          }}
        />

        {/* Prompt content field - text vs. chat */}
        <>
          <FormItem>
            <FormLabel>Prompt</FormLabel>
            <Tabs
              value={form.watch("type")}
              onValueChange={(e) => {
                form.setValue("type", e as PromptType);
              }}
              className="min-h-[240px]"
            >
              <TabsList className="flex w-full">
                <TabsTrigger
                  disabled={
                    Boolean(initialPromptContent) &&
                    initialPromptContent?.type !== PromptType.Text
                  }
                  className="flex-1"
                  value={PromptType.Text}
                >
                  {capitalize(PromptType.Text)}
                </TabsTrigger>
                <TabsTrigger
                  disabled={
                    Boolean(initialPromptContent) &&
                    initialPromptContent?.type !== PromptType.Chat
                  }
                  className="flex-1"
                  value={PromptType.Chat}
                >
                  {capitalize(PromptType.Chat)}
                </TabsTrigger>
              </TabsList>
              <TabsContent value={PromptType.Text}>
                <FormField
                  control={form.control}
                  name="textPrompt"
                  render={({ field }) => (
                    <>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[150px] flex-1 font-mono text-xs"
                        />
                      </FormControl>
                      <FormMessage />
                    </>
                  )}
                />
              </TabsContent>
              <TabsContent value={PromptType.Chat}>
                <FormField
                  control={form.control}
                  name="chatPrompt"
                  render={({ field }) => (
                    <>
                      <PromptChatMessages {...field} />
                      <FormMessage />
                    </>
                  )}
                />
              </TabsContent>
            </Tabs>
          </FormItem>
          <p className="text-sm text-gray-500">
            You can use <code className="text-xs">{"{{variable}}"}</code> to
            insert variables into your prompt. The following variables are
            available:
          </p>
          <div className="flex flex-wrap gap-2">
            {currentExtractedVariables.map((variable) => (
              <Badge key={variable} variant="outline">
                {variable}
              </Badge>
            ))}
          </div>
        </>

        {/* Prompt Config field */}
        <FormField
          control={form.control}
          name="config"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Config</FormLabel>
              <JsonView
                src={jsonSchema.parse(JSON.parse(field.value))}
                onEdit={(edit) => {
                  field.onChange(JSON.stringify(edit.src));
                }}
                editable
                className="rounded-md border border-gray-200 p-2 text-sm"
              />
              <FormDescription>
                Track configs for LLM API calls such as function definitions or
                LLM parameters.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Activate prompt field */}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Activate prompt</FormLabel>
              </div>
              {currentIsActive ? (
                <div className="text-xs text-gray-500">
                  Activating the prompt will make it available to the SDKs
                  immediately.
                </div>
              ) : null}
            </FormItem>
          )}
        />
        <Button
          type="submit"
          loading={createPromptMutation.isLoading}
          className="w-full"
        >
          Create prompt
        </Button>
      </form>
      {formError && (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      )}
    </Form>
  );
};
