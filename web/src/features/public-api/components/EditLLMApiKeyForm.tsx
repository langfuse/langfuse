import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BedrockConfig,
  type BedrockCredential,
  LLMAdapter,
} from "@langfuse/shared";
import { PlusIcon, TrashIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { useState } from "react";
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

import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";

const formSchema = z
  .object({
    secretKey: z.string().optional(),
    provider: z
      .string()
      .min(1, "Please add a provider name that identifies this connection."),
    adapter: z.nativeEnum(LLMAdapter),
    baseURL: z
      .string()
      .optional()
      .refine(
        (val) => !val || val === "" || z.string().url().safeParse(val).success,
        {
          message: "Base URL must be a valid URL or empty",
        },
      ),
    withDefaultModels: z.boolean(),
    customModels: z.array(z.object({ value: z.string().min(1) })),
    awsAccessKeyId: z.string().optional(),
    awsSecretAccessKey: z.string().optional(),
    awsRegion: z.string().optional(),
    extraHeaders: z.array(
      z.object({ key: z.string().min(1), value: z.string().min(1) }),
    ),
  })
  .refine((data) => data.withDefaultModels || data.customModels.length > 0, {
    message:
      "At least one custom model name is required when default models are disabled.",
    path: ["withDefaultModels"],
  })
  .refine(
    (data) =>
      data.adapter !== LLMAdapter.Bedrock ||
      (data.awsAccessKeyId && data.awsSecretAccessKey && data.awsRegion),
    {
      message: "AWS credentials are required when using Bedrock adapter.",
      path: ["adapter"],
    },
  );

type LLMApiKeyData = {
  id: string;
  provider: string;
  adapter: LLMAdapter;
  baseURL?: string;
  displaySecretKey?: string;
  customModels: string[];
  withDefaultModels: boolean;
  extraHeaderKeys?: string[];
  updatedAt: Date;
};

export function EditLLMApiKeyForm({
  projectId,
  apiKeyData,
  onSuccess,
  customization,
  existingApiKeys,
}: {
  projectId?: string;
  apiKeyData: LLMApiKeyData;
  onSuccess: () => void;
  customization: ReturnType<typeof useUiCustomization>;
  existingApiKeys?: { id: string; provider: string }[];
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [showSecretKey, setShowSecretKey] = useState(false);

  const hasUpdateAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:update",
  });

  const mutUpdateLlmApiKey = api.llmApiKey.update.useMutation({
    onSuccess: () => {
      utils.llmApiKey.all.invalidate({ projectId: projectId as string });
      onSuccess();
    },
    onError: (error) => {
      console.error("Failed to update LLM API key:", error);
      form.setError("root", {
        type: "manual",
        message: error.message || "Failed to update API key. Please try again.",
      });
    },
  });

  const mutTestLLMApiKey = api.llmApiKey.test.useMutation({
    onError: (error) => {
      console.error("Failed to test LLM API key:", error);
      form.setError("root", {
        type: "manual",
        message: `API key test failed: ${error.message || "Unknown error"}`,
      });
    },
  });

  const getCustomizedBaseURL = (adapter: LLMAdapter) => {
    switch (adapter) {
      case LLMAdapter.OpenAI:
        return customization?.defaultBaseUrlOpenAI ?? "";
      case LLMAdapter.Azure:
        return customization?.defaultBaseUrlAzure ?? "";
      case LLMAdapter.Anthropic:
        return customization?.defaultBaseUrlAnthropic ?? "";
      case LLMAdapter.Atla:
        return "https://api.atla-ai.com/v1/integrations/langfuse";
      default:
        return "";
    }
  };

  const getDefaultValues = () => {
    const baseDefaults = {
      adapter: apiKeyData.adapter,
      provider: apiKeyData.provider,
      secretKey: "",
      baseURL: apiKeyData.baseURL || "",
      withDefaultModels: apiKeyData.withDefaultModels,
      customModels: apiKeyData.customModels.map((model) => ({ value: model })),
      extraHeaders:
        apiKeyData.extraHeaderKeys?.map((key) => ({
          key,
          value: "[encrypted]",
        })) || [],
    };

    // Only include AWS fields for Bedrock adapter
    if (apiKeyData.adapter === LLMAdapter.Bedrock) {
      return {
        ...baseDefaults,
        awsAccessKeyId: "",
        awsSecretAccessKey: "",
        awsRegion: "",
      };
    }

    return baseDefaults;
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  const currentAdapter = form.watch("adapter");

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "customModels",
  });

  const {
    fields: headerFields,
    append: appendHeader,
    remove: removeHeader,
  } = useFieldArray({
    control: form.control,
    name: "extraHeaders",
  });

  if (!hasUpdateAccess) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-muted-foreground">
          You do not have permission to update LLM API keys for this project.
        </div>
      </div>
    );
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!projectId) {
      form.setError("root", {
        type: "manual",
        message: "Project ID not found. Please refresh the page and try again.",
      });
      return;
    }

    // Check for provider name conflicts (excluding current key)
    if (!existingApiKeys) {
      form.setError("root", {
        type: "manual",
        message:
          "Unable to validate provider name. Please refresh and try again.",
      });
      return;
    }

    const otherKeys = existingApiKeys.filter((k) => k.id !== apiKeyData.id);
    if (otherKeys.map((k) => k.provider.toLowerCase()).includes(values.provider.toLowerCase())) {
      form.setError("provider", {
        type: "manual",
        message: "There already exists an API key for this provider.",
      });
      return;
    }

    // Detect if credentials are being updated
    const hasSecretKeyChange = values.secretKey?.trim() !== "";
    const hasBedrockCredsChange =
      currentAdapter === LLMAdapter.Bedrock &&
      values.awsAccessKeyId?.trim() &&
      values.awsSecretAccessKey?.trim() &&
      values.awsRegion?.trim();
    const hasHeaderChanges = values.extraHeaders.some(
      (h) => h.value.trim() !== "" && h.value.trim() !== "[encrypted]",
    );

    const hasCredentialChanges =
      hasSecretKeyChange || hasBedrockCredsChange || hasHeaderChanges;

    capture("project_settings:llm_api_key_update" as any, {
      provider: values.provider,
      hasCredentialChanges,
    });

    // Prepare update data
    const updateData: any = {
      id: apiKeyData.id,
      projectId,
      lastKnownUpdate: apiKeyData.updatedAt,
      provider: values.provider,
      adapter: values.adapter,
      baseURL:
        values.baseURL && values.baseURL !== "" ? values.baseURL : undefined,
      withDefaultModels: values.withDefaultModels,
      customModels: values.customModels
        .map((m) => m.value.trim())
        .filter(Boolean),
    };

    // Handle secret key update
    if (hasCredentialChanges) {
      let secretKey = values.secretKey;
      let config: BedrockConfig | undefined;

      if (currentAdapter === LLMAdapter.Bedrock) {
        const credentials: BedrockCredential = {
          accessKeyId: values.awsAccessKeyId ?? "",
          secretAccessKey: values.awsSecretAccessKey ?? "",
        };
        secretKey = JSON.stringify(credentials);

        config = {
          region: values.awsRegion ?? "",
        };
      }

      updateData.secretKey = secretKey;
      updateData.config = config;
    }

    // Handle extra headers update
    const existingHeaderKeys = new Set(apiKeyData.extraHeaderKeys || []);

    const updatedHeaders = values.extraHeaders.filter((h) => {
      if (h.key.trim() === "" || h.value.trim() === "") return false;

      // For existing headers: skip if value is still [encrypted] (unchanged)
      if (existingHeaderKeys.has(h.key) && h.value.trim() === "[encrypted]") {
        return false;
      }

      // For new headers: include even if value is "[encrypted]" (user explicitly set it)
      // For existing headers with changed values: include normally
      return true;
    });

    if (updatedHeaders.length > 0) {
      updateData.extraHeaders = updatedHeaders.reduce(
        (acc, header) => {
          acc[header.key] = header.value;
          return acc;
        },
        {} as Record<string, string>,
      );
    }

    // Test the API key if credentials are being updated
    if (hasCredentialChanges) {
      try {
        const testResult = await mutTestLLMApiKey.mutateAsync({
          projectId,
          secretKey: updateData.secretKey ?? "",
          provider: updateData.provider,
          adapter: updateData.adapter,
          baseURL: updateData.baseURL,
          withDefaultModels: updateData.withDefaultModels,
          config: updateData.config,
          customModels: updateData.customModels,
          extraHeaders: updateData.extraHeaders,
        });

        if (!testResult.success) throw new Error(testResult.error);
      } catch (error) {
        console.error(error);
        form.setError("root", {
          type: "manual",
          message:
            error instanceof Error
              ? error.message
              : "Could not verify the API key.",
        });
        return;
      }
    }

    try {
      await mutUpdateLlmApiKey.mutateAsync(updateData);
      // Success is handled by the mutation's onSuccess callback
    } catch (error) {
      // Error is handled by the mutation's onError callback
      console.error("Update failed:", error);
    }
  }

  return (
    <Form {...form}>
      <DialogBody>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  {Object.values(LLMAdapter).map((provider) => (
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
        {currentAdapter !== LLMAdapter.Bedrock && (
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
                  {currentAdapter === LLMAdapter.Atla && (
                    <span className="text-dark-yellow">
                      <br />
                      Please use the Atla default base URL:
                      https://api.atla-ai.com/v1/integrations/langfuse
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
        )}

        {/* Secret Key Fields */}
        <>
          {currentAdapter === LLMAdapter.Bedrock ? (
            <>
              <FormField
                control={form.control}
                name="awsRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AWS Region</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="awsAccessKeyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AWS Access Key ID</FormLabel>
                    <FormDescription>
                      These should be long-lived credentials for an AWS user
                      with `bedrock:InvokeModel` permission.
                    </FormDescription>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="awsSecretAccessKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AWS Secret Access Key</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : (
            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormDescription>
                    Your API keys are stored encrypted on our servers.
                  </FormDescription>
                  {currentAdapter === LLMAdapter.VertexAI && (
                    <FormDescription className="text-dark-yellow">
                      Paste your GCP service account JSON key here. The service
                      account must have `Vertex AI User` role permissions.
                      Example JSON:
                      <pre className="text-xs">
                        {`{
  "type": "service_account",
  "project_id": "<project_id>",
  "private_key_id": "<private_key_id>",
  "private_key": "<private_key>",
  "client_email": "<client_email>",
  "client_id": "<client_id>",
  "auth_uri": "<auth_uri>",
  "token_uri": "<token_uri>",
  "auth_provider_x509_cert_url": "<auth_provider_x509_cert_url>",
  "client_x509_cert_url": "<client_x509_cert_url>",
}`}
                      </pre>
                    </FormDescription>
                  )}
                  <div className="relative">
                    <FormControl>
                      <Input
                        {...field}
                        type={showSecretKey ? "text" : "password"}
                        placeholder="Enter new API key or leave blank to keep current..."
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-0 h-full px-2"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                    >
                      {showSecretKey ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </>

        {/* Extra Headers - for supported adapters */}
        {(currentAdapter === LLMAdapter.OpenAI ||
          currentAdapter === LLMAdapter.Azure) && (
          <FormField
            control={form.control}
            name="extraHeaders"
            render={() => (
              <FormItem>
                <FormLabel>Extra Headers</FormLabel>
                <FormDescription>
                  Optional additional HTTP headers to include with requests
                  towards LLM provider. All header values stored encrypted on
                  our servers. Existing values shown as [encrypted]. Leave
                  unchanged to keep current values, or enter new values to
                  update.
                </FormDescription>

                {headerFields.map((header, index) => (
                  <div key={header.id} className="flex flex-row space-x-2">
                    <Input
                      {...form.register(`extraHeaders.${index}.key`)}
                      placeholder="Header name"
                    />
                    <Input
                      {...form.register(`extraHeaders.${index}.value`)}
                      placeholder="Header value"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeHeader(index)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => appendHeader({ key: "", value: "" })}
                  className="w-full"
                >
                  <PlusIcon
                    className="-ml-0.5 mr-1.5 h-5 w-5"
                    aria-hidden="true"
                  />
                  Add Header
                </Button>
              </FormItem>
            )}
          />
        )}

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
                      Azure LLM adapter does not support default model names
                      maintained by Langfuse. Instead, please add a custom model
                      below that is the same as your deployment name.
                    </FormDescription>
                  )}
                  {currentAdapter === LLMAdapter.Bedrock && (
                    <FormDescription className="text-dark-yellow">
                      Bedrock LLM adapter does not support default model names
                      maintained by Langfuse. Instead, please add the Bedrock
                      model IDs you have enabled in the AWS console.
                    </FormDescription>
                  )}
                </span>

                <FormControl>
                  <Switch
                    disabled={
                      currentAdapter === LLMAdapter.Azure ||
                      currentAdapter === LLMAdapter.Bedrock
                    }
                    checked={
                      currentAdapter === LLMAdapter.Azure ||
                      currentAdapter === LLMAdapter.Bedrock
                        ? false
                        : field.value
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

              {currentAdapter === LLMAdapter.Bedrock && (
                <FormDescription className="text-dark-yellow">
                  {
                    "For Bedrock, the model name is the Bedrock Inference Profile ID, e.g. 'eu.anthropic.claude-3-5-sonnet-20240620-v1:0'"
                  }
                </FormDescription>
              )}

              {fields.map((customModel, index) => (
                <span key={customModel.id} className="flex flex-row space-x-2">
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



        {form.formState.errors.root && (
          <FormMessage>{form.formState.errors.root.message}</FormMessage>
        )}
        </form>
        <DialogFooter>
          <Button
            type="submit"
            className="w-full"
            loading={
              form.formState.isSubmitting ||
              mutTestLLMApiKey.isLoading ||
              mutUpdateLlmApiKey.isLoading
            }
            onClick={form.handleSubmit(onSubmit)}
          >
            {mutTestLLMApiKey.isLoading
              ? "Testing API key..."
              : mutUpdateLlmApiKey.isLoading
                ? "Updating..."
                : "Update LLM API key"}
          </Button>
        </DialogFooter>
      </DialogBody>
    </Form>
  );
}
