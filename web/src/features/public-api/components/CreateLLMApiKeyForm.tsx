import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LLMAdapter } from "@langfuse/shared";
import { PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";

const formSchema = z
  .object({
    secretKey: z.string().min(1),
    provider: z
      .string()
      .min(1, "Please add a provider name that identifies this connection."),
    adapter: z.nativeEnum(LLMAdapter),
    baseURL: z.union([z.literal(""), z.string().url()]),
    withDefaultModels: z.boolean(),
    customModels: z.array(z.object({ value: z.string().min(1) })),
  })
  .refine((data) => data.withDefaultModels || data.customModels.length > 0, {
    message:
      "At least one custom model name is required when default models are disabled.",
    path: ["withDefaultModels"],
  });

export function CreateLLMApiKeyForm({
  projectId,
  evalModelsOnly,
  onSuccess,
  customization,
}: {
  projectId?: string;
  evalModelsOnly?: boolean;
  onSuccess: () => void;
  customization: ReturnType<typeof useUiCustomization>;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const existingKeys = api.llmApiKey.all.useQuery(
    {
      projectId: projectId as string,
    },
    { enabled: Boolean(projectId) },
  );

  const mutCreateLlmApiKey = api.llmApiKey.create.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });

  const mutTestLLMApiKey = api.llmApiKey.test.useMutation();

  const defaultAdapter: LLMAdapter = customization?.defaultModelAdapter
    ? LLMAdapter[customization.defaultModelAdapter]
    : LLMAdapter.OpenAI;

  const getCustomizedBaseURL = (adapter: LLMAdapter) => {
    switch (adapter) {
      case LLMAdapter.OpenAI:
        return customization?.defaultBaseUrlOpenAI ?? "";
      case LLMAdapter.Azure:
        return customization?.defaultBaseUrlAzure ?? "";
      case LLMAdapter.Anthropic:
        return customization?.defaultBaseUrlAnthropic ?? "";
      default:
        return "";
    }
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      adapter: defaultAdapter,
      provider: "",
      secretKey: "",
      baseURL: getCustomizedBaseURL(defaultAdapter),
      withDefaultModels: true,
      customModels: [],
    },
  });

  const currentAdapter = form.watch("adapter");

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "customModels",
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!projectId) return console.error("No project ID found.");
    if (
      existingKeys?.data?.data.map((k) => k.provider).includes(values.provider)
    ) {
      form.setError("provider", {
        type: "manual",
        message: "There already exists an API key for this provider.",
      });
      return;
    }
    capture("project_settings:llm_api_key_create", {
      provider: values.provider,
    });

    const newKey = {
      projectId,
      secretKey: values.secretKey,
      provider: values.provider,
      adapter: values.adapter,
      baseURL: values.baseURL || undefined,
      withDefaultModels: values.withDefaultModels,
      customModels: values.customModels
        .map((m) => m.value.trim())
        .filter(Boolean),
    };

    try {
      const testResult = await mutTestLLMApiKey.mutateAsync(newKey);

      if (!testResult.success) throw new Error(testResult.error);
    } catch (error) {
      console.error(error);
      form.setError("secretKey", {
        type: "manual",
        message:
          error instanceof Error
            ? error.message
            : "Could not verify the API key.",
      });

      return;
    }

    return mutCreateLlmApiKey
      .mutateAsync(newKey)
      .then(() => {
        form.reset();
        onSuccess();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        className={cn("flex flex-col gap-6 overflow-auto pb-2 pl-1 pr-4")}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {/* Provider name */}
        <FormField
          control={form.control}
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider name</FormLabel>
              <FormDescription>
                Name to identify the key within Langfuse.
              </FormDescription>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* LLM adapter */}
        <FormField
          control={form.control}
          name="adapter"
          render={({ field }) => (
            <FormItem>
              <FormLabel>LLM adapter</FormLabel>
              <FormDescription>
                Schema that is accepted at that provider endpoint.
              </FormDescription>
              <Select
                defaultValue={field.value}
                onValueChange={(value) => {
                  field.onChange(value as LLMAdapter);
                  form.setValue(
                    "baseURL",
                    getCustomizedBaseURL(value as LLMAdapter),
                  );
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a LLM provider" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(LLMAdapter)
                    .filter(
                      (provider) =>
                        !evalModelsOnly ||
                        provider === LLMAdapter.OpenAI ||
                        provider === LLMAdapter.Azure,
                    )
                    .map((provider) => (
                      <SelectItem value={provider} key={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* baseURL */}
        <FormField
          control={form.control}
          name="baseURL"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Base URL</FormLabel>
              <FormDescription>
                Leave blank to use the default base URL for the given LLM
                adapter.{" "}
                {currentAdapter === LLMAdapter.OpenAI && (
                  <span>OpenAI default: https://api.openai.com/v1</span>
                )}
                {currentAdapter === LLMAdapter.Azure && (
                  <span>
                    Please add the base URL in the following format (or
                    compatible API):
                    https://&#123;instanceName&#125;.openai.azure.com/openai/deployments
                  </span>
                )}
                {currentAdapter === LLMAdapter.Anthropic && (
                  <span>
                    Anthropic default: https://api.anthropic.com (excluding
                    /v1/messages)
                  </span>
                )}
              </FormDescription>

              <FormControl>
                <Input {...field} placeholder="default" />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />

        {/* API key */}
        <FormField
          control={form.control}
          name="secretKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormDescription>
                Your API keys are stored encrypted on our servers.
              </FormDescription>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* With default models */}
        <FormField
          control={form.control}
          name="withDefaultModels"
          render={({ field }) => (
            <FormItem>
              <span className="row flex">
                <span className="flex-1">
                  <FormLabel>Enable default models</FormLabel>
                  <FormDescription>
                    Default models for the selected adapter will be available in
                    Langfuse features.
                  </FormDescription>
                  {currentAdapter === LLMAdapter.Azure && (
                    <FormDescription className="text-dark-yellow">
                      Azure LLM adapter does not support default models. Please
                      add a custom model with your deployment name.
                    </FormDescription>
                  )}
                </span>

                <FormControl>
                  <Switch
                    disabled={currentAdapter === LLMAdapter.Azure}
                    checked={
                      currentAdapter === LLMAdapter.Azure ? false : field.value
                    }
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </span>

              <FormMessage />
            </FormItem>
          )}
        />

        {/* Custom model names */}
        <FormField
          control={form.control}
          name="customModels"
          render={() => (
            <FormItem>
              <FormLabel>Custom models</FormLabel>
              <FormDescription>
                Custom model names accepted by given endpoint.
              </FormDescription>
              {currentAdapter === LLMAdapter.Azure && (
                <FormDescription className="text-dark-yellow">
                  {
                    "For Azure, the model name should be the same as the deployment name in Azure. For evals, choose a model with function calling capabilities."
                  }
                </FormDescription>
              )}

              {fields.map((customModel, index) => (
                <span key={index} className="flex flex-row space-x-2">
                  <Input
                    {...form.register(`customModels.${index}.value`)}
                    placeholder={`Custom model name ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => remove(index)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </span>
              ))}

              <Button
                type="button"
                variant="ghost"
                onClick={() => append({ value: "" })}
                className="w-full"
              >
                <PlusIcon
                  className="-ml-0.5 mr-1.5 h-5 w-5"
                  aria-hidden="true"
                />
                Add custom model name
              </Button>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
        >
          Save new LLM API key
        </Button>

        <FormMessage />
      </form>
    </Form>
  );
}
