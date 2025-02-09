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
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Prompt,
  extractVariables,
  getIsCharOrUnderscore,
} from "@langfuse/shared";
import { PromptChatMessages } from "./PromptChatMessages";
import { ReviewPromptDialog } from "./ReviewPromptDialog";
import {
  NewPromptFormSchema,
  type NewPromptFormSchemaType,
  PromptVariantSchema,
  type PromptVariant,
} from "./validation";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";
import { PromptDescription } from "@/src/features/prompts/components/prompt-description";
import { CodeMirrorEditor } from "@/src/components/editor";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { useQueryParam } from "use-query-params";
import { usePromptNameValidation } from "@/src/features/prompts/hooks/usePromptNameValidation";

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

  let initialPromptVariant: PromptVariant | null;
  try {
    initialPromptVariant = PromptVariantSchema.parse({
      type: initialPrompt?.type,
      prompt: initialPrompt?.prompt?.valueOf(),
    });
  } catch (err) {
    initialPromptVariant = null;
  }

  const defaultValues: NewPromptFormSchemaType = {
    type: initialPromptVariant?.type ?? PromptType.Text,
    chatPrompt:
      initialPromptVariant?.type === PromptType.Chat
        ? initialPromptVariant?.prompt
        : [],
    textPrompt:
      initialPromptVariant?.type === PromptType.Text
        ? initialPromptVariant?.prompt
        : "",
    name: initialPrompt?.name ?? "",
    config: JSON.stringify(initialPrompt?.config?.valueOf(), null, 2) || "{}",
    isActive: !Boolean(initialPrompt),
  };

  const form = useForm<NewPromptFormSchemaType>({
    resolver: zodResolver(NewPromptFormSchema),
    mode: "onTouched",
    defaultValues,
  });

  const currentName = form.watch("name");
  const currentType = form.watch("type");
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
    {
      enabled: Boolean(projectId),
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
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

  usePromptNameValidation({
    currentName,
    allPrompts,
    form,
  });

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
                      Boolean(initialPromptVariant) &&
                      initialPromptVariant?.type !== PromptType.Text
                    }
                    className="flex-1"
                    value={PromptType.Text}
                  >
                    {capitalize(PromptType.Text)}
                  </TabsTrigger>
                  <TabsTrigger
                    disabled={
                      Boolean(initialPromptVariant) &&
                      initialPromptVariant?.type !== PromptType.Chat
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
                        <CodeMirrorEditor
                          value={field.value}
                          onChange={field.onChange}
                          editable
                          mode="prompt"
                          minHeight={200}
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
              <CodeMirrorEditor
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                editable
                mode="json"
                minHeight="none"
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
            <FormItem>
              <FormLabel>Labels</FormLabel>
              <div className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Set the &quot;production&quot; label</FormLabel>
                </div>
              </div>
              <FormDescription>
                This version will be labeled as the version to be used in
                production for this prompt. Can be updated later.
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="commitMessage"
          render={({ field }) => (
            <FormItem className="relative">
              <FormLabel>Commit message (optional)</FormLabel>
              <FormDescription>
                Provide information about the changes made in this version.
                Helps maintain a clear history of prompt iterations.
              </FormDescription>
              <FormControl>
                <Textarea
                  placeholder="Add commit message..."
                  {...field}
                  className="rounded-md border text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {initialPrompt ? (
          <div className="flex flex-col gap-2">
            <ReviewPromptDialog
              initialPrompt={initialPrompt}
              getNewPromptValues={form.getValues}
              isLoading={createPromptMutation.isLoading}
              onConfirm={form.handleSubmit(onSubmit)}
            >
              <Button
                disabled={!form.formState.isValid}
                variant="secondary"
                className="w-full"
              >
                Review changes
              </Button>
            </ReviewPromptDialog>

            <Button
              type="submit"
              loading={createPromptMutation.isLoading}
              className="w-full"
              disabled={!form.formState.isValid}
            >
              Save new prompt version
            </Button>
          </div>
        ) : (
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
        )}
      </form>
      {formError && (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      )}
    </Form>
  );
};
