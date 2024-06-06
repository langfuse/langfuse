import { capitalize } from "lodash";
import router from "next/router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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
} from "@/src/features/prompts/server/utils/validation";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { extractVariables, getIsCharOrUnderscore } from "@/src/utils/string";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Prompt } from "@langfuse/shared";
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
import { PromptDescription } from "@/src/features/prompts/components/prompt-description";
import { JsonEditor } from "@/src/components/json-editor";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { useQueryParam } from "use-query-params";

type NewPromptFormProps = {
  initialPrompt?: Prompt | null;
  onFormSuccess?: () => void;
};

export const NewPromptForm: React.FC<NewPromptFormProps> = (props) => {
  const { onFormSuccess, initialPrompt } = props;
  const projectId = useProjectIdFromURL();
  const [shouldLoadPlaygroundCache] = useQueryParam("loadPlaygroundCache");
  const [formError, setFormError] = useState<string | null>(null);
  const { playgroundCache } = usePlaygroundCache();
  const [initialMessages, setInitialMessages] = useState<unknown>([]);

  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

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
    config: JSON.stringify(initialPrompt?.config?.valueOf(), null, 2) || "{}",
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
  ).filter(getIsCharOrUnderscore);

  const createPromptMutation = api.prompts.create.useMutation({
    onSuccess: () => utils.prompts.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  const allPrompts = api.prompts.filterOptions.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
    },
    { enabled: Boolean(projectId) },
  ).data?.name;

  function onSubmit(values: NewPromptFormSchemaType) {
    capture(
      initialPrompt ? "prompts:update_form_submit" : "prompts:new_form_submit",
      {
        type: values.type,
        active: values.isActive,
        hasConfig: values.config !== "{}",
        countVariables: currentExtractedVariables.length,
      },
    );

    if (!projectId) throw Error("Project ID is not defined.");

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
        labels: values.isActive ? [PRODUCTION_LABEL] : [],
      };
    } else {
      newPrompt = {
        ...values,
        projectId,
        type,
        prompt: textPrompt,
        config: JSON.parse(values.config),
        labels: values.isActive ? [PRODUCTION_LABEL] : [],
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
    if (shouldLoadPlaygroundCache && playgroundCache) {
      form.setValue("type", PromptType.Chat);

      setInitialMessages(playgroundCache.messages);
    } else if (initialPrompt?.type === PromptType.Chat) {
      setInitialMessages(initialPrompt.prompt);
    }
  }, [playgroundCache, initialPrompt, form, shouldLoadPlaygroundCache]);

  useEffect(() => {
    const isNewPrompt = !allPrompts
      ?.map((prompt) => prompt.value)
      .includes(currentName);

    if (!isNewPrompt) {
      form.setError("name", { message: "Prompt name already exist." });
    } else if (currentName === "new") {
      form.setError("name", { message: "Prompt name cannot be 'new'" });
    } else if (currentName && !/^[a-zA-Z0-9_\-.]+$/.test(currentName)) {
      form.setError("name", {
        message:
          "Name must be alphanumeric with optional underscores, hyphens, or periods",
      });
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
                          className="min-h-[200px] flex-1 font-mono text-xs"
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
                      <PromptChatMessages
                        {...field}
                        initialMessages={initialMessages}
                      />
                      <FormMessage />
                    </>
                  )}
                />
              </TabsContent>
            </Tabs>
          </FormItem>
          <PromptDescription
            currentExtractedVariables={currentExtractedVariables}
          />
        </>

        {/* Prompt Config field */}
        <FormField
          control={form.control}
          name="config"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Config</FormLabel>
              <JsonEditor
                defaultValue={field.value}
                onChange={field.onChange}
                editable
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
                <FormLabel>Serve prompt as default to SDKs</FormLabel>
              </div>
              {currentIsActive ? (
                <div className="text-xs text-muted-foreground">
                  This makes the prompt available to the SDKs immediately.
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
          {!initialPrompt ? "Create prompt" : "Update prompt"}
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
