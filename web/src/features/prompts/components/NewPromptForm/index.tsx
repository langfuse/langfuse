import { capitalize } from "lodash";
import router from "next/router";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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
import {
  type CreatePromptTRPCType,
  PromptType,
} from "@/src/features/prompts/server/validation";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { jsonSchema } from "@/src/utils/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Prompt } from "@langfuse/shared/src/db";

import { PromptChatMessages } from "./PromptChatMessages";
import {
  NewPromptFormSchema,
  type NewPromptFormSchemaType,
  PromptContentSchema,
  type PromptContentType,
} from "./validation";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";

type NewPromptFormProps = {
  initialPrompt?: Prompt | null;
  onFormSuccess?: () => void;
};

export const NewPromptForm: React.FC<NewPromptFormProps> = (props) => {
  const { onFormSuccess, initialPrompt } = props;
  const projectId = useProjectIdFromURL();
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

  useEffect(() => {
    const isNewPrompt = !allPrompts
      ?.map((prompt) => prompt.name)
      .includes(currentName);

    if (!isNewPrompt) {
      form.setError("name", { message: "Prompt name already exist." });
    } else {
      form.clearErrors("name");
    }
  }, [currentName, allPrompts, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        {/* Prompt name field - text vs. chat only for new prompts */}
        {!initialPrompt ? (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => {
              const errorMessage = form.getFieldState("name").error?.message;

              return (
                <div>
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Select a prompt name" {...field} />
                    </FormControl>
                    {/* Custom form message to include a link to the already existing prompt */}
                    {form.getFieldState("name").error ? (
                      <div className="flex flex-row space-x-1 text-sm font-medium text-destructive">
                        <p className="text-sm font-medium text-destructive">
                          {errorMessage}
                        </p>
                        {errorMessage?.includes("already exist") ? (
                          <Link
                            href={`/project/${projectId}/prompts/${currentName.trim()}`}
                            className="flex flex-row"
                          >
                            Create a new version for it here.{" "}
                            <ArrowTopRightIcon />
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </FormItem>
                </div>
              );
            }}
          />
        ) : null}

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
              {!initialPrompt ? (
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
              ) : null}
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
            insert variables into your prompt.
            {currentExtractedVariables.length > 0
              ? " The following variables are available:"
              : ""}
          </p>
          <div className="flex min-h-6 flex-wrap gap-2">
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
          disabled={Boolean(
            !initialPrompt && form.formState.errors.name?.message,
          )} // Disable button if prompt name already exists. Check is dynamic and not part of zod schema
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
