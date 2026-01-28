import { useFieldArray, useForm } from "react-hook-form";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BedrockConfig,
  type BedrockCredential,
  type VertexAIConfig,
  LLMAdapter,
  type LlmApiKeys,
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  VERTEXAI_USE_DEFAULT_CREDENTIALS,
} from "@langfuse/shared";
import { ChevronDown, PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod/v4";
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
import { DialogFooter } from "@/src/components/ui/dialog";
import { DialogBody } from "@/src/components/ui/dialog";
import { env } from "@/src/env.mjs";

const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

const isCustomModelsRequired = (adapter: LLMAdapter) =>
  adapter === LLMAdapter.Azure || adapter === LLMAdapter.Bedrock;

const createFormSchema = (mode: "create" | "update") =>
  z
    .object({
      secretKey: z.string().optional(),
      provider: z
        .string()
        .min(1, "Please add a provider name that identifies this connection.")
        .regex(
          /^[^:]+$/,
          "Provider name cannot contain colons. Use a format like 'OpenRouter_Mistral' instead.",
        ),
      adapter: z.nativeEnum(LLMAdapter),
      baseURL: z.union([z.literal(""), z.url()]),
      withDefaultModels: z.boolean(),
      customModels: z.array(z.object({ value: z.string().min(1) })),
      awsAccessKeyId: z.string().optional(),
      awsSecretAccessKey: z.string().optional(),
      awsRegion: z.string().optional(),
      vertexAILocation: z.string().optional(),
      extraHeaders: z.array(
        z.object({
          key: z.string().min(1),
          value: mode === "create" ? z.string().min(1) : z.string().optional(),
        }),
      ),
    })
    // 1) Bedrock validation - credentials required in create mode
    .refine(
      (data) => {
        if (data.adapter !== LLMAdapter.Bedrock) return true;

        // In update mode, credentials are optional (existing ones are preserved)
        if (mode === "update") {
          // Only validate region is present
          return data.awsRegion;
        }

        // In create mode, validate credentials
        // For cloud deployments, AWS credentials are required
        if (isLangfuseCloud) {
          return (
            data.awsAccessKeyId && data.awsSecretAccessKey && data.awsRegion
          );
        }

        // For self-hosted deployments, only region is required
        return data.awsRegion;
      },
      {
        message:
          mode === "update"
            ? "AWS region is required."
            : isLangfuseCloud
              ? "AWS credentials are required for Bedrock"
              : "AWS region is required.",
        path: ["adapter"],
      },
    )
    .refine(
      (data) => {
        if (isCustomModelsRequired(data.adapter)) {
          return data.customModels.length > 0;
        }
        return true;
      },
      {
        message: "At least one custom model is required for this adapter.",
        path: ["customModels"],
      },
    )
    // 2) For adapters that support defaults, require default models or at least one custom model
    .refine(
      (data) => {
        if (isCustomModelsRequired(data.adapter)) {
          return true;
        }
        return data.withDefaultModels || data.customModels.length > 0;
      },
      {
        message:
          "At least one custom model name is required when default models are disabled.",
        path: ["withDefaultModels"],
      },
    )
    // Vertex AI validation - service account key or ADC sentinel value required
    .refine(
      (data) => {
        if (data.adapter !== LLMAdapter.VertexAI) return true;

        // In update mode, credentials are optional (existing ones are preserved)
        if (mode === "update") return true;

        // secretKey is required (either JSON key or VERTEXAI_USE_DEFAULT_CREDENTIALS sentinel)
        return !!data.secretKey;
      },
      {
        message: isLangfuseCloud
          ? "GCP service account JSON key is required for Vertex AI"
          : "GCP service account JSON key or Application Default Credentials is required.",
        path: ["secretKey"],
      },
    )
    .refine(
      (data) =>
        data.adapter === LLMAdapter.Bedrock ||
        data.adapter === LLMAdapter.VertexAI ||
        mode === "update" ||
        data.secretKey,
      {
        message: "Secret key is required.",
        path: ["secretKey"],
      },
    )
    .refine(
      (data) => {
        if (data.adapter !== LLMAdapter.Azure) return true;
        return data.baseURL && data.baseURL.trim() !== "";
      },
      {
        message: "API Base URL is required for Azure connections.",
        path: ["baseURL"],
      },
    );

interface CreateLLMApiKeyFormProps {
  projectId?: string;
  onSuccess: () => void;
  customization: ReturnType<typeof useUiCustomization>;
  mode?: "create" | "update";
  existingKey?: LlmApiKeys;
}

export function CreateLLMApiKeyForm({
  projectId,
  onSuccess,
  customization,
  mode = "create",
  existingKey,
}: CreateLLMApiKeyFormProps) {
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
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

  const mutUpdateLlmApiKey = api.llmApiKey.update.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });

  const mutTestLLMApiKey = api.llmApiKey.test.useMutation();
  const mutTestUpdateLLMApiKey = api.llmApiKey.testUpdate.useMutation();

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

  const formSchema = createFormSchema(mode);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues:
      mode === "update" && existingKey
        ? {
            adapter: existingKey.adapter as LLMAdapter,
            provider: existingKey.provider,
            secretKey:
              existingKey.adapter === LLMAdapter.VertexAI &&
              existingKey.displaySecretKey === "Default GCP credentials (ADC)"
                ? VERTEXAI_USE_DEFAULT_CREDENTIALS
                : "",
            baseURL:
              existingKey.baseURL ??
              getCustomizedBaseURL(existingKey.adapter as LLMAdapter),
            withDefaultModels: existingKey.withDefaultModels,
            customModels: existingKey.customModels.map((value) => ({ value })),
            extraHeaders:
              existingKey.extraHeaderKeys?.map((key) => ({ key, value: "" })) ??
              [],
            vertexAILocation:
              existingKey.adapter === LLMAdapter.VertexAI && existingKey.config
                ? ((existingKey.config as VertexAIConfig).location ?? "")
                : "",
            awsRegion:
              existingKey.adapter === LLMAdapter.Bedrock && existingKey.config
                ? ((existingKey.config as BedrockConfig).region ?? "")
                : "",
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
          }
        : {
            adapter: defaultAdapter,
            provider: "",
            secretKey: "",
            baseURL: getCustomizedBaseURL(defaultAdapter),
            withDefaultModels: true,
            customModels: [],
            extraHeaders: [],
            vertexAILocation: "global",
            awsRegion: "",
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
          },
  });

  const currentAdapter = form.watch("adapter");

  const hasAdvancedSettings = (adapter: LLMAdapter) =>
    adapter === LLMAdapter.OpenAI ||
    adapter === LLMAdapter.Anthropic ||
    adapter === LLMAdapter.VertexAI ||
    adapter === LLMAdapter.GoogleAIStudio;

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

  const renderCustomModelsField = () => (
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
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add custom model name
          </Button>
        </FormItem>
      )}
    />
  );

  const renderExtraHeadersField = () => (
    <FormField
      control={form.control}
      name="extraHeaders"
      render={() => (
        <FormItem>
          <FormLabel>Extra Headers</FormLabel>
          <FormDescription>
            Optional additional HTTP headers to include with requests towards
            LLM provider. All header values stored encrypted{" "}
            {isLangfuseCloud ? "on our servers" : "in your database"}.
          </FormDescription>

          {headerFields.map((header, index) => (
            <div key={header.id} className="flex flex-row space-x-2">
              <Input
                {...form.register(`extraHeaders.${index}.key`)}
                placeholder="Header name"
              />
              <Input
                {...form.register(`extraHeaders.${index}.value`)}
                placeholder={
                  mode === "update" &&
                  existingKey?.extraHeaderKeys &&
                  existingKey.extraHeaderKeys[index]
                    ? "***"
                    : "Header value"
                }
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
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add Header
          </Button>
        </FormItem>
      )}
    />
  );

  // Disable provider and adapter fields in update mode
  const isFieldDisabled = (fieldName: string) => {
    if (mode !== "update") return false;
    return ["provider", "adapter"].includes(fieldName);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!projectId) return console.error("No project ID found.");

    if (mode === "create") {
      if (
        existingKeys?.data?.data
          .map((k) => k.provider)
          .includes(values.provider)
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
    } else {
      capture("project_settings:llm_api_key_update", {
        provider: values.provider,
      });
    }

    let secretKey = values.secretKey;
    let config: BedrockConfig | VertexAIConfig | undefined;

    if (currentAdapter === LLMAdapter.Bedrock) {
      // In update mode, only update credentials if provided
      if (mode === "update") {
        // Only update secretKey if both credentials are provided
        if (values.awsAccessKeyId && values.awsSecretAccessKey) {
          const credentials: BedrockCredential = {
            accessKeyId: values.awsAccessKeyId,
            secretAccessKey: values.awsSecretAccessKey,
          };
          secretKey = JSON.stringify(credentials);
        } else {
          // Keep existing credentials by not setting secretKey
          secretKey = undefined;
        }
      } else {
        // In create mode, handle as before
        if (
          !isLangfuseCloud &&
          (!values.awsAccessKeyId || !values.awsSecretAccessKey)
        ) {
          secretKey = BEDROCK_USE_DEFAULT_CREDENTIALS;
        } else {
          const credentials: BedrockCredential = {
            accessKeyId: values.awsAccessKeyId ?? "",
            secretAccessKey: values.awsSecretAccessKey ?? "",
          };
          secretKey = JSON.stringify(credentials);
        }
      }

      config = {
        region: values.awsRegion ?? "",
      };
    } else if (currentAdapter === LLMAdapter.VertexAI) {
      // Handle Vertex AI credentials
      // secretKey already contains either JSON key or VERTEXAI_USE_DEFAULT_CREDENTIALS sentinel
      if (mode === "update") {
        // In update mode, only update secretKey if a new one is provided
        if (values.secretKey) {
          secretKey = values.secretKey;
        } else {
          // Keep existing credentials by not setting secretKey
          secretKey = undefined;
        }
      }
      // In create mode, secretKey is already set from values.secretKey

      // Build config with location only (projectId removed for security - ADC auto-detects)
      config = {};
      if (values.vertexAILocation?.trim()) {
        config.location = values.vertexAILocation.trim();
      }
      // If config is empty, set to undefined
      if (Object.keys(config).length === 0) {
        config = undefined;
      }
    }

    const extraHeaders =
      values.extraHeaders.length > 0
        ? values.extraHeaders.reduce(
            (acc, header) => {
              acc[header.key] = header.value ?? "";
              return acc;
            },
            {} as Record<string, string>,
          )
        : undefined;

    const newLlmApiKey = {
      id: existingKey?.id ?? "",
      projectId,
      secretKey: secretKey ?? "",
      provider: values.provider,
      adapter: values.adapter,
      baseURL: values.baseURL || undefined,
      withDefaultModels: isCustomModelsRequired(currentAdapter)
        ? false
        : values.withDefaultModels,
      config,
      customModels: values.customModels
        .map((m) => m.value.trim())
        .filter(Boolean),
      extraHeaders,
    };

    try {
      const testResult =
        mode === "create"
          ? await mutTestLLMApiKey.mutateAsync(newLlmApiKey)
          : await mutTestUpdateLLMApiKey.mutateAsync(newLlmApiKey);

      if (!testResult.success) throw new Error(testResult.error);
    } catch (error) {
      form.setError("root", {
        type: "manual",
        message:
          error instanceof Error
            ? error.message
            : "Could not verify the API key.",
      });

      return;
    }

    return (mode === "create" ? mutCreateLlmApiKey : mutUpdateLlmApiKey)
      .mutateAsync(newLlmApiKey)
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
        className={cn("flex flex-col gap-4 overflow-auto")}
        onSubmit={(e) => {
          e.stopPropagation(); // Prevent event bubbling to parent forms
          form.handleSubmit(onSubmit)(e);
        }}
      >
        <DialogBody>
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
                  disabled={isFieldDisabled("adapter")}
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
          {/* Provider name */}
          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider name</FormLabel>
                <FormDescription>
                  Key to identify the connection within Langfuse. Cannot contain
                  colons.
                </FormDescription>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={`e.g. ${currentAdapter}`}
                    disabled={isFieldDisabled("provider")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* API Key or AWS Credentials or Vertex AI Credentials */}
          {currentAdapter === LLMAdapter.Bedrock ? (
            <>
              <FormField
                control={form.control}
                name="awsRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AWS Region</FormLabel>
                    <FormDescription>
                      {mode === "update" &&
                        existingKey?.config &&
                        (existingKey.config as BedrockConfig).region && (
                          <span className="text-sm">
                            Current:{" "}
                            <code className="rounded bg-muted px-1 py-0.5">
                              {(existingKey.config as BedrockConfig).region}
                            </code>
                          </span>
                        )}
                    </FormDescription>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          mode === "update" && existingKey?.config
                            ? ((existingKey.config as BedrockConfig).region ??
                              "")
                            : "e.g., us-east-1"
                        }
                        data-1p-ignore
                      />
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
                    <FormLabel>
                      AWS Access Key ID
                      {!isLangfuseCloud && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </FormLabel>
                    <FormDescription>
                      {mode === "update"
                        ? "Leave empty to keep existing credentials. To update, provide both Access Key ID and Secret Access Key."
                        : isLangfuseCloud
                          ? "These should be long-lived credentials for an AWS user with `bedrock:InvokeModel` permission."
                          : "For self-hosted deployments, AWS credentials are optional. When omitted, authentication will use the AWS SDK default credential provider chain."}
                    </FormDescription>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          mode === "update"
                            ? existingKey?.displaySecretKey ===
                              "Default AWS credentials"
                              ? "Using default AWS credentials"
                              : "•••••••• (existing credentials preserved if empty)"
                            : undefined
                        }
                        autoComplete="off"
                        data-1p-ignore
                      />
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
                    <FormLabel>
                      AWS Secret Access Key
                      {!isLangfuseCloud && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder={
                          mode === "update"
                            ? existingKey?.displaySecretKey ===
                              "Default AWS credentials"
                              ? "Using default AWS credentials"
                              : existingKey?.displaySecretKey
                                ? `${existingKey.displaySecretKey} (preserved if empty)`
                                : "•••••••• (existing credentials preserved if empty)"
                            : undefined
                        }
                        autoComplete="new-password"
                        data-1p-ignore
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isLangfuseCloud && (
                <div className="space-y-2 border-l-2 border-blue-200 pl-4 text-sm text-muted-foreground">
                  <p>
                    <strong>Default credential provider chain:</strong> When AWS
                    credentials are omitted, the system will automatically check
                    for credentials in this order:
                  </p>
                  <ul className="ml-2 list-inside list-disc space-y-1">
                    <li>
                      Environment variables (AWS_ACCESS_KEY_ID,
                      AWS_SECRET_ACCESS_KEY)
                    </li>
                    <li>AWS credentials file (~/.aws/credentials)</li>
                    <li>IAM roles for EC2 instances</li>
                    <li>IAM roles for ECS tasks</li>
                  </ul>
                  <p>
                    <a
                      href="https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800"
                    >
                      Learn more about AWS credential providers →
                    </a>
                  </p>
                </div>
              )}
            </>
          ) : currentAdapter === LLMAdapter.VertexAI ? (
            <>
              {/* Vertex AI ADC option for self-hosted only, create mode only */}
              {!isLangfuseCloud && mode === "create" && (
                <FormItem>
                  <span className="row flex">
                    <span className="flex-1">
                      <FormLabel>
                        Use Application Default Credentials (ADC)
                      </FormLabel>
                      <FormDescription>
                        When enabled, authentication uses the GCP
                        environment&apos;s default credentials instead of a
                        service account key.
                      </FormDescription>
                    </span>
                    <FormControl>
                      <Switch
                        checked={
                          form.watch("secretKey") ===
                          VERTEXAI_USE_DEFAULT_CREDENTIALS
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            form.setValue(
                              "secretKey",
                              VERTEXAI_USE_DEFAULT_CREDENTIALS,
                            );
                          } else {
                            form.setValue("secretKey", "");
                          }
                        }}
                      />
                    </FormControl>
                  </span>
                </FormItem>
              )}

              {/* Service Account Key - hidden when ADC is enabled */}
              {(isLangfuseCloud ||
                form.watch("secretKey") !==
                  VERTEXAI_USE_DEFAULT_CREDENTIALS) && (
                <FormField
                  control={form.control}
                  name="secretKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GCP Service Account Key (JSON)</FormLabel>
                      <FormDescription>
                        {isLangfuseCloud
                          ? "Your API keys are stored encrypted on our servers."
                          : "Your API keys are stored encrypted in your database."}
                      </FormDescription>
                      <FormDescription className="text-dark-yellow">
                        Paste your GCP service account JSON key here. The
                        service account must have `Vertex AI User` role
                        permissions. Example JSON:
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
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={
                            mode === "update"
                              ? existingKey?.displaySecretKey
                              : '{"type": "service_account", ...}'
                          }
                          autoComplete="off"
                          spellCheck="false"
                          autoCapitalize="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* ADC info box for self-hosted */}
              {!isLangfuseCloud &&
                form.watch("secretKey") ===
                  VERTEXAI_USE_DEFAULT_CREDENTIALS && (
                  <div className="space-y-2 border-l-2 border-blue-200 pl-4 text-sm text-muted-foreground">
                    <p>
                      <strong>Application Default Credentials (ADC):</strong>{" "}
                      When enabled, the system will automatically check for
                      credentials in this order:
                    </p>
                    <ul className="ml-2 list-inside list-disc space-y-1">
                      <li>
                        Environment variable (GOOGLE_APPLICATION_CREDENTIALS)
                      </li>
                      <li>
                        gcloud CLI credentials (gcloud auth application-default
                        login)
                      </li>
                      <li>GKE Workload Identity</li>
                      <li>Cloud Run service account</li>
                      <li>GCE instance service account (metadata service)</li>
                    </ul>
                    <p>
                      <a
                        href="https://cloud.google.com/docs/authentication/application-default-credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        Learn more about GCP Application Default Credentials →
                      </a>
                    </p>
                  </div>
                )}
            </>
          ) : (
            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormDescription>
                    {isLangfuseCloud
                      ? "Your API keys are stored encrypted on our servers."
                      : "Your API keys are stored encrypted in your database."}
                  </FormDescription>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={
                        mode === "update"
                          ? existingKey?.displaySecretKey
                          : undefined
                      }
                      autoComplete="off"
                      spellCheck="false"
                      autoCapitalize="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Azure Base URL - Always required for Azure */}
          {currentAdapter === LLMAdapter.Azure && (
            <FormField
              control={form.control}
              name="baseURL"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Base URL</FormLabel>
                  <FormDescription>
                    Please add the base URL in the following format (or
                    compatible API):
                    https://&#123;instanceName&#125;.openai.azure.com/openai/deployments
                  </FormDescription>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://your-instance.openai.azure.com/openai/deployments"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Custom models: top-level for Azure/Bedrock */}
          {isCustomModelsRequired(currentAdapter) && renderCustomModelsField()}

          {/* Extra headers - show for Azure in main section (Azure has no advanced settings) */}
          {currentAdapter === LLMAdapter.Azure && renderExtraHeadersField()}

          {hasAdvancedSettings(currentAdapter) && (
            <div className="flex items-center">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="flex items-center pl-0"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <span>
                  {showAdvancedSettings
                    ? "Hide advanced settings"
                    : "Show advanced settings"}
                </span>
                <ChevronDown
                  className={`ml-1 h-4 w-4 transition-transform ${showAdvancedSettings ? "rotate-180" : "rotate-0"}`}
                />
              </Button>
            </div>
          )}

          {hasAdvancedSettings(currentAdapter) && showAdvancedSettings && (
            <div className="space-y-4 border-t pt-4">
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
                      {currentAdapter === LLMAdapter.Anthropic && (
                        <span>
                          Anthropic default: https://api.anthropic.com
                          (excluding /v1/messages)
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

              {/* VertexAI Location */}
              {currentAdapter === LLMAdapter.VertexAI && (
                <FormField
                  control={form.control}
                  name="vertexAILocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location (Optional)</FormLabel>
                      <FormDescription>
                        Google Cloud region (e.g., global, us-central1,
                        europe-west4). Defaults to{" "}
                        <span className="font-medium">global</span> as required
                        for Gemini 3 models.
                      </FormDescription>
                      <FormControl>
                        <Input {...field} placeholder="global" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Extra Headers */}
              {currentAdapter === LLMAdapter.OpenAI &&
                renderExtraHeadersField()}

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
                          Default models for the selected adapter will be
                          available in Langfuse features.
                        </FormDescription>
                      </span>

                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </span>

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Custom model names */}
              {!isCustomModelsRequired(currentAdapter) &&
                renderCustomModelsField()}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <div className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              {mode === "create" ? "Create connection" : "Save changes"}
            </Button>
            {form.formState.errors.root && (
              <FormMessage>{form.formState.errors.root.message}</FormMessage>
            )}
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
