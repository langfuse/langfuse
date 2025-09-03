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
import { useTranslation } from "next-i18next";

const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

const isCustomModelsRequired = (adapter: LLMAdapter) =>
  adapter === LLMAdapter.Azure || adapter === LLMAdapter.Bedrock;

const createFormSchema = (mode: "create" | "update") =>
  z
    .object({
      secretKey: z.string().optional(),
      provider: z
        .string()
        .min(1, "Please add a provider name that identifies this connection."),
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
    // 1) If adapter requires custom models, enforce that first
    .refine(
      (data) => {
        if (data.adapter !== LLMAdapter.Bedrock) return true;

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
        message: isLangfuseCloud
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
    .refine(
      (data) =>
        data.adapter === LLMAdapter.Bedrock ||
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
  const { t } = useTranslation("common");
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
            secretKey: "",
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
          }
        : {
            adapter: defaultAdapter,
            provider: "",
            secretKey: "",
            baseURL: getCustomizedBaseURL(defaultAdapter),
            withDefaultModels: true,
            customModels: [],
            extraHeaders: [],
            vertexAILocation: "",
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
          <FormLabel>{t("llm.customModels")}</FormLabel>
          <FormDescription>{t("llm.customModelsDescription")}</FormDescription>
          {currentAdapter === LLMAdapter.Azure && (
            <FormDescription className="text-dark-yellow">
              {t("llm.azureCustomModelsHint")}
            </FormDescription>
          )}

          {currentAdapter === LLMAdapter.Bedrock && (
            <FormDescription className="text-dark-yellow">
              {t("llm.bedrockCustomModelsHint")}
            </FormDescription>
          )}

          {fields.map((customModel, index) => (
            <span key={customModel.id} className="flex flex-row space-x-2">
              <Input
                {...form.register(`customModels.${index}.value`)}
                placeholder={`${t("llm.customModelName")} ${index + 1}`}
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
            {t("llm.addCustomModelName")}
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
          <FormLabel>{t("llm.extraHeaders")}</FormLabel>
          <FormDescription>
            {t("llm.extraHeadersDescription", {
              where: isLangfuseCloud
                ? t("llm.onOurServers")
                : t("llm.inYourDatabase"),
            })}
          </FormDescription>

          {headerFields.map((header, index) => (
            <div key={header.id} className="flex flex-row space-x-2">
              <Input
                {...form.register(`extraHeaders.${index}.key`)}
                placeholder={t("llm.headerName")}
              />
              <Input
                {...form.register(`extraHeaders.${index}.value`)}
                placeholder={
                  mode === "update" &&
                  existingKey?.extraHeaderKeys &&
                  existingKey.extraHeaderKeys[index]
                    ? "***"
                    : t("llm.headerValue")
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
            {t("llm.addHeader")}
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
      // For self-hosted deployments, allow empty credentials to use default provider chain
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

      config = {
        region: values.awsRegion ?? "",
      };
    } else if (
      currentAdapter === LLMAdapter.VertexAI &&
      values.vertexAILocation
    ) {
      config = {
        location: values.vertexAILocation.trim(),
      };
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
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <DialogBody>
          {/* LLM adapter */}
          <FormField
            control={form.control}
            name="adapter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("llm.adapter")}</FormLabel>
                <FormDescription>{t("llm.adapterDescription")}</FormDescription>
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
                      <SelectValue
                        placeholder={t("llm.selectProviderPlaceholder")}
                      />
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
                <FormLabel>{t("llm.providerName")}</FormLabel>
                <FormDescription>
                  {t("llm.providerNameDescription")}
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

          {/* API Key or AWS Credentials */}
          {currentAdapter === LLMAdapter.Bedrock ? (
            <>
              <FormField
                control={form.control}
                name="awsRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("llm.awsRegion")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-1p-ignore />
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
                      {t("llm.awsAccessKeyId")}
                      {!isLangfuseCloud && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          {t("llm.optional")}
                        </span>
                      )}
                    </FormLabel>
                    <FormDescription>
                      {isLangfuseCloud
                        ? t("llm.awsAccessKeyIdDescCloud")
                        : t("llm.awsAccessKeyIdDescSelfHosted")}
                    </FormDescription>
                    <FormControl>
                      <Input {...field} data-1p-ignore />
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
                      {t("llm.awsSecretAccessKey")}
                      {!isLangfuseCloud && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          {t("llm.optional")}
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} data-1p-ignore />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isLangfuseCloud && (
                <div className="space-y-2 border-l-2 border-blue-200 pl-4 text-sm text-muted-foreground">
                  <p>
                    <strong>{t("llm.defaultCredentialChainTitle")}</strong>{" "}
                    {t("llm.defaultCredentialChainDesc")}
                  </p>
                  <ul className="ml-2 list-inside list-disc space-y-1">
                    <li>{t("llm.credentialEnvVars")}</li>
                    <li>{t("llm.credentialFile")}</li>
                    <li>{t("llm.credentialEc2Role")}</li>
                    <li>{t("llm.credentialEcsRole")}</li>
                  </ul>
                  <p>
                    <a
                      href="https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800"
                    >
                      {t("llm.learnMoreAwsCredentials")}
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
                  <FormLabel>{t("llm.apiKey")}</FormLabel>
                  <FormDescription>
                    {isLangfuseCloud
                      ? t("llm.apiKeysStoredDescCloud")
                      : t("llm.apiKeysStoredDescSelfHosted")}
                  </FormDescription>
                  {currentAdapter === LLMAdapter.VertexAI && (
                    <FormDescription className="text-dark-yellow">
                      {t("llm.vertexJsonHint")}
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
                  <FormLabel>{t("llm.apiBaseUrl")}</FormLabel>
                  <FormDescription>{t("llm.azureBaseUrlHint")}</FormDescription>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("llm.azureBaseUrlPlaceholder")}
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
                    <FormLabel>{t("llm.apiBaseUrl")}</FormLabel>
                    <FormDescription>
                      {t("llm.apiBaseUrlAdvancedHint")}
                    </FormDescription>

                    <FormControl>
                      <Input {...field} placeholder={t("llm.default")} />
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
                      <FormLabel>{t("llm.vertexLocationOptional")}</FormLabel>
                      <FormDescription>
                        {t("llm.vertexLocationDescription")}
                      </FormDescription>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t("llm.vertexLocationPlaceholder")}
                        />
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
                        <FormLabel>{t("llm.enableDefaultModels")}</FormLabel>
                        <FormDescription>
                          {t("llm.enableDefaultModelsDescription")}
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
              {mode === "create" ? t("llm.createConnection") : t("common.save")}
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
