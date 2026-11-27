import { useId, useMemo, useState, type ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, LifeBuoy, SquareArrowOutUpRight } from "@langfuse/icons";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";

import {
  AsyncMultiSelectTagInput,
  type MultiSelectTagOption,
} from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import {
  Banner,
  type BannerAction,
} from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import {
  ConnectionTestStatus,
  type ConnectionTestFailure,
} from "@/src/features/ai-gateway/components/ConnectionTestStatus/ConnectionTestStatus";
import { GatewayGuardrailTestInput } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/components/GatewayGuardrailTestInput/GatewayGuardrailTestInput";
import {
  GatewayGuardrailTargetsInput,
  type GatewayGuardrailTargetPicker,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTargetsInput/GatewayGuardrailTargetsInput";
import {
  GATEWAY_GUARDRAIL_PRESET_LABELS,
  GATEWAY_GUARDRAIL_TEMPLATES,
  getGuardrailTypeForTemplate,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { RegionSelect } from "@/src/features/ai-gateway/components/RegionSelect";
import { bedrockRegionGroups } from "@/src/features/ai-gateway/constants/bedrockRegions";
import { GATEWAY_GUARDRAILS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import {
  GATEWAY_GUARDRAIL_ACTION_DESCRIPTIONS,
  GATEWAY_GUARDRAIL_ACTION_LABELS,
  GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH,
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS,
  GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH,
  GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
  GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES,
  GATEWAY_GUARDRAIL_MAX_TARGETS,
  GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH,
  GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_SCOPE_DESCRIPTIONS,
  GATEWAY_GUARDRAIL_SCOPE_LABELS,
  GATEWAY_GUARDRAIL_SCOPES,
  GATEWAY_GUARDRAIL_UNICODE_NOT_ALLOWED_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_UNSUPPORTED_BACKREFERENCE_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_UNSUPPORTED_LOOKAROUND_ERROR_MESSAGE,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import type { GatewayGuardrailsLimitFeedbackReason } from "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback";
import {
  GATEWAY_GUARDRAIL_ACTION_SCOPES,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES,
  GatewayBedrockGuardrailConfigSchema,
  GatewayGuardrailCustomRegexSchema,
  GatewayGuardrailRedactionLabelSchema,
  GATEWAY_OPENAI_MODERATION_REGIONS,
  GatewayExternalGuardrailApiKeySchema,
  guardrailScopeChecksOutput,
  parseContainsWordsText,
  resolveSupportedGuardrailScope,
  supportsEntireInputScope,
  validateContainsWordsText,
  validateSecretPrefix,
  type GatewayGuardrailPreset,
  type GatewayGuardrailTemplateKind,
  type GatewayGuardrailUiAction,
  type GatewayOpenAiModerationGuardrailConfig,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type {
  GatewayGuardrailScope,
  GatewayGuardrailType,
} from "@langfuse/shared/src/db";
import { cn } from "@/src/utils/tailwind";

function toActionOption(value: GatewayGuardrailUiAction) {
  const label = GATEWAY_GUARDRAIL_ACTION_LABELS[value];
  return {
    value,
    label,
    explanation: {
      title: label,
      description: GATEWAY_GUARDRAIL_ACTION_DESCRIPTIONS[value],
    },
  };
}

function toScopeSelectOption(value: GatewayGuardrailScope) {
  const label = GATEWAY_GUARDRAIL_SCOPE_LABELS[value];
  return {
    value,
    label,
    explanation: {
      title: label,
      description: GATEWAY_GUARDRAIL_SCOPE_DESCRIPTIONS[value],
    },
  };
}

const ACTION_OPTIONS_BY_TYPE: Record<
  GatewayGuardrailType,
  ReturnType<typeof toActionOption>[]
> = {
  REGEX: GATEWAY_GUARDRAIL_TYPE_CAPABILITIES.REGEX.actions.map(toActionOption),
  BEDROCK:
    GATEWAY_GUARDRAIL_TYPE_CAPABILITIES.BEDROCK.actions.map(toActionOption),
  OPENAI_MODERATION:
    GATEWAY_GUARDRAIL_TYPE_CAPABILITIES.OPENAI_MODERATION.actions.map(
      toActionOption,
    ),
};

const OPENAI_MODERATION_REGION_OPTIONS: {
  value: GatewayOpenAiModerationGuardrailConfig["region"];
  label: string;
}[] = [
  { value: "us", label: "US (api.openai.com)" },
  { value: "eu", label: "EU (eu.api.openai.com)" },
];

const SCOPE_OPTIONS_ALL = GATEWAY_GUARDRAIL_SCOPES.map(toScopeSelectOption);
const SCOPE_OPTIONS_BLOCK =
  GATEWAY_GUARDRAIL_ACTION_SCOPES.BLOCK.map(toScopeSelectOption);

const BEDROCK_FIELD_PATHS = {
  guardrailId: "bedrockGuardrailId",
  guardrailVersion: "bedrockGuardrailVersion",
  region: "bedrockRegion",
} as const;

const PRESET_VALUE_PREFIX = "preset:";
const CUSTOM_PREFIX_VALUE_PREFIX = "prefix:";
const ADD_PREFIX_VALUE_PREFIX = "add-prefix:";

function createGuardrailFormSchema(
  templateKind: GatewayGuardrailTemplateKind,
  hasSavedApiKey: boolean,
) {
  const capabilities =
    GATEWAY_GUARDRAIL_TYPE_CAPABILITIES[
      getGuardrailTypeForTemplate(templateKind)
    ];
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Enter a name for this guardrail")
        .max(
          GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
          `Name must be at most ${GATEWAY_GUARDRAIL_MAX_NAME_LENGTH} characters`,
        ),
      presets: z.array(z.enum(GATEWAY_GUARDRAIL_PRESET_KEYS)),
      secretPrefixes: z
        .array(z.string())
        .max(
          GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES,
          `At most ${GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES} custom prefixes are allowed`,
        ),
      containsText: z.string(),
      customRegex: z.string(),
      bedrockGuardrailId: z.string(),
      bedrockGuardrailVersion: z.string(),
      bedrockRegion: z.string(),
      openAiModerationRegion: z.enum(GATEWAY_OPENAI_MODERATION_REGIONS),
      apiKey: z.string(),
      action: z.enum(capabilities.actions),
      scope: z.enum(GATEWAY_GUARDRAIL_SCOPES),
      redactionLabel: z.string(),
      targets: z
        .array(z.custom<AsyncAutocompleteOption>())
        .min(1, "Select who this guardrail applies to")
        .max(
          GATEWAY_GUARDRAIL_MAX_TARGETS,
          `Select at most ${GATEWAY_GUARDRAIL_MAX_TARGETS} targets`,
        ),
    })
    .superRefine((values, ctx) => {
      if (
        !(
          GATEWAY_GUARDRAIL_ACTION_SCOPES[
            values.action
          ] as readonly GatewayGuardrailScope[]
        ).includes(values.scope)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scope"],
          message: "Block guardrails only evaluate the last turn",
        });
      }
      if (capabilities.supportsRedactionLabel && values.action === "REDACT") {
        const labelResult = GatewayGuardrailRedactionLabelSchema.safeParse(
          values.redactionLabel,
        );
        if (!labelResult.success) {
          ctx.addIssue({
            code: "custom",
            path: ["redactionLabel"],
            message:
              labelResult.error.issues[0]?.message ??
              "Enter a replacement label",
          });
        }
      }
      if (templateKind === "bedrock") {
        const configResult = GatewayBedrockGuardrailConfigSchema.safeParse({
          guardrailId: values.bedrockGuardrailId,
          guardrailVersion: values.bedrockGuardrailVersion,
          region: values.bedrockRegion,
        });
        if (!configResult.success) {
          for (const issue of configResult.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string" && key in BEDROCK_FIELD_PATHS) {
              ctx.addIssue({
                code: "custom",
                path: [
                  BEDROCK_FIELD_PATHS[key as keyof typeof BEDROCK_FIELD_PATHS],
                ],
                message: issue.message,
              });
            }
          }
        }
      }
      if (isExternalTemplate(templateKind)) {
        if (!hasSavedApiKey || values.apiKey.trim()) {
          const apiKeyResult = GatewayExternalGuardrailApiKeySchema.safeParse(
            values.apiKey,
          );
          if (!apiKeyResult.success) {
            ctx.addIssue({
              code: "custom",
              path: ["apiKey"],
              message:
                apiKeyResult.error.issues[0]?.message ?? "Enter an API key",
            });
          }
        }
        return;
      }
      if (templateKind === "contains") {
        const error = validateContainsWordsText(values.containsText);
        if (error) {
          ctx.addIssue({
            code: "custom",
            path: ["containsText"],
            message: error,
          });
        }
        return;
      }
      if (templateKind === "custom_regex") {
        const regexResult = GatewayGuardrailCustomRegexSchema.safeParse(
          values.customRegex,
        );
        if (!regexResult.success) {
          ctx.addIssue({
            code: "custom",
            path: ["customRegex"],
            message:
              regexResult.error.issues[0]?.message ??
              "Enter a regular expression",
          });
        }
        return;
      }
      if (
        values.presets.length === 0 &&
        (templateKind !== "secrets" || values.secretPrefixes.length === 0)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["presets"],
          message:
            templateKind === "secrets"
              ? "Select at least one secret type or add a custom prefix"
              : "Select at least one pattern to detect",
        });
      }
      for (const prefix of values.secretPrefixes) {
        const error = validateSecretPrefix(prefix);
        if (error) {
          ctx.addIssue({
            code: "custom",
            path: ["secretPrefixes"],
            message: error,
          });
          break;
        }
      }
    });
}

type GuardrailFormSchemaValues = z.infer<
  ReturnType<typeof createGuardrailFormSchema>
>;

export type GatewayGuardrailFormValues = {
  name: string;
  presets: GatewayGuardrailPreset[];
  secretPrefixes: string[];
  containsWords: string[];
  customRegex?: string | null;
  bedrock?: {
    guardrailId: string;
    guardrailVersion: string;
    region: string;
    apiKey?: string;
  };
  openAiModeration?: GatewayOpenAiModerationGuardrailConfig & {
    apiKey?: string;
  };
  action: GatewayGuardrailUiAction;
  scope?: GatewayGuardrailScope;
  redactionLabel?: string;
  targets: AsyncAutocompleteOption[];
};

export type ExternalGuardrailTestOutcome = {
  status: "pending" | "success" | "error";
  failure?: ConnectionTestFailure;
};

export type ExternalGuardrailTestControl = {
  isPending: boolean;
  outcome: ExternalGuardrailTestOutcome | null;
  onTest: (values: GatewayGuardrailFormValues) => void;
};

type CustomRegexPreviewResult = {
  valid: boolean;
  error?: string;
  errorCode?: string;
  matches: Array<{ start: number; end: number }>;
  truncated?: boolean;
};

export type CustomRegexPreviewControl = {
  pattern: string;
  text: string;
  isFetching: boolean;
  result: CustomRegexPreviewResult | null;
  onChange: (pattern: string, text: string) => void;
};

export type GatewayGuardrailFormDialogProps = {
  submitLabel: string;
  templateKind: GatewayGuardrailTemplateKind;
  availablePresets: readonly GatewayGuardrailPreset[];
  initialValues: GatewayGuardrailFormValues;
  initialTestText?: string;
  /** True when editing an existing external guardrail so a blank key keeps the saved secret. */
  hasSavedApiKey?: boolean;
  externalTest?: ExternalGuardrailTestControl;
  customRegexPreview?: CustomRegexPreviewControl;
  targetPicker: GatewayGuardrailTargetPicker;
  isSubmitting: boolean;
  errorMessage: string | null;
  onContactSupport?: (reason?: GatewayGuardrailsLimitFeedbackReason) => void;
  onSubmit: (values: GatewayGuardrailFormValues) => void;
};

export function GatewayGuardrailFormDialog({
  submitLabel,
  templateKind,
  availablePresets,
  initialValues,
  initialTestText = "",
  hasSavedApiKey = false,
  externalTest,
  customRegexPreview,
  targetPicker,
  isSubmitting,
  errorMessage,
  onContactSupport,
  onSubmit,
}: GatewayGuardrailFormDialogProps) {
  const formId = useId();
  const [testText, setTestText] = useState(initialTestText);

  const schema = useMemo(
    () => createGuardrailFormSchema(templateKind, hasSavedApiKey),
    [templateKind, hasSavedApiKey],
  );
  const form = useForm<GuardrailFormSchemaValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues.name,
      presets: initialValues.presets,
      secretPrefixes: initialValues.secretPrefixes,
      containsText: initialValues.containsWords.join("\n"),
      customRegex: initialValues.customRegex ?? "",
      bedrockGuardrailId: initialValues.bedrock?.guardrailId ?? "",
      bedrockGuardrailVersion: initialValues.bedrock?.guardrailVersion ?? "",
      bedrockRegion: initialValues.bedrock?.region ?? "",
      openAiModerationRegion: initialValues.openAiModeration?.region ?? "us",
      apiKey: "",
      action: initialValues.action,
      scope: resolveSupportedGuardrailScope(
        initialValues.action,
        initialValues.scope ?? "LAST_TURN",
      ),
      redactionLabel:
        initialValues.redactionLabel ??
        GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
      targets: initialValues.targets,
    },
    mode: "onChange",
  });

  const selectedPresets = form.watch("presets");
  const secretPrefixes = form.watch("secretPrefixes");
  const containsText = form.watch("containsText");
  const customRegex = form.watch("customRegex");
  const bedrockGuardrailId = form.watch("bedrockGuardrailId");
  const bedrockGuardrailVersion = form.watch("bedrockGuardrailVersion");
  const bedrockRegion = form.watch("bedrockRegion");
  const apiKey = form.watch("apiKey");
  const selectedAction = form.watch("action");
  const selectedScope = form.watch("scope");
  const checksOutput = guardrailScopeChecksOutput(selectedScope);
  const parsedContains = useMemo(
    () =>
      templateKind === "contains" ? parseContainsWordsText(containsText) : [],
    [templateKind, containsText],
  );
  const guardrailType = getGuardrailTypeForTemplate(templateKind);
  const capabilities = GATEWAY_GUARDRAIL_TYPE_CAPABILITIES[guardrailType];
  const activeTemplate =
    GATEWAY_GUARDRAIL_TEMPLATES.find(
      (template) => template.id === templateKind,
    ) ?? null;
  const externalTemplate = activeTemplate?.external ?? null;
  const templateNotice = activeTemplate?.notice ?? null;
  const isExternal = externalTemplate !== null;
  const isTesting = externalTest?.isPending ?? false;
  const isBusy = isSubmitting || isTesting;
  const isApiKeyReady =
    (hasSavedApiKey && apiKey.trim().length === 0) ||
    GatewayExternalGuardrailApiKeySchema.safeParse(apiKey).success;
  const canTestExternal =
    isExternal &&
    isApiKeyReady &&
    (templateKind !== "bedrock" ||
      GatewayBedrockGuardrailConfigSchema.safeParse({
        guardrailId: bedrockGuardrailId,
        guardrailVersion: bedrockGuardrailVersion,
        region: bedrockRegion,
      }).success);

  const isCustomRegex = templateKind === "custom_regex";
  const activeCustomRegexPreview =
    isCustomRegex &&
    customRegexPreview &&
    customRegexPreview.pattern === customRegex
      ? customRegexPreview.result
      : null;
  const customRegexServerError =
    activeCustomRegexPreview && !activeCustomRegexPreview.valid
      ? (activeCustomRegexPreview.error ?? "Invalid regular expression")
      : undefined;
  const customRegexServerErrorCode =
    activeCustomRegexPreview && !activeCustomRegexPreview.valid
      ? activeCustomRegexPreview.errorCode
      : undefined;
  const isCurrentCustomRegexPreview =
    Boolean(activeCustomRegexPreview?.valid) &&
    customRegexPreview?.text ===
      testText.slice(0, GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH);
  const customRegexMatches = isCurrentCustomRegexPreview
    ? (activeCustomRegexPreview?.matches ?? [])
    : [];
  const customRegexTruncated = isCurrentCustomRegexPreview
    ? Boolean(activeCustomRegexPreview?.truncated)
    : false;

  const toFormValues = (
    values: GuardrailFormSchemaValues,
  ): GatewayGuardrailFormValues => {
    const apiKey = values.apiKey.trim();
    if (templateKind === "bedrock") {
      return {
        name: values.name.trim(),
        presets: [],
        secretPrefixes: [],
        containsWords: [],
        customRegex: null,
        bedrock: {
          guardrailId: values.bedrockGuardrailId.trim(),
          guardrailVersion: values.bedrockGuardrailVersion.trim(),
          region: values.bedrockRegion.trim(),
          ...(apiKey ? { apiKey } : {}),
        },
        action: values.action,
        scope: values.scope,
        targets: values.targets,
      };
    }
    if (templateKind === "openai_moderation") {
      return {
        name: values.name.trim(),
        presets: [],
        secretPrefixes: [],
        containsWords: [],
        customRegex: null,
        openAiModeration: {
          region: values.openAiModerationRegion,
          ...(apiKey ? { apiKey } : {}),
        },
        action: values.action,
        scope: values.scope,
        targets: values.targets,
      };
    }
    const redactionLabel =
      values.action === "REDACT" ? values.redactionLabel.trim() : undefined;
    return {
      name: values.name.trim(),
      presets:
        templateKind === "contains" || templateKind === "custom_regex"
          ? initialValues.presets
          : values.presets,
      secretPrefixes:
        templateKind === "secrets"
          ? values.secretPrefixes
          : initialValues.secretPrefixes,
      containsWords:
        templateKind === "contains"
          ? parseContainsWordsText(values.containsText)
          : initialValues.containsWords,
      customRegex:
        templateKind === "custom_regex"
          ? values.customRegex
          : initialValues.customRegex,
      action: values.action,
      scope: values.scope,
      redactionLabel,
      targets: values.targets,
    };
  };

  const handleCustomRegexChange = (nextPattern: string) => {
    customRegexPreview?.onChange(nextPattern, testText);
  };

  const handleTestTextChange = (nextText: string) => {
    setTestText(nextText);
    if (isCustomRegex) {
      customRegexPreview?.onChange(customRegex, nextText);
    }
  };

  const handleValidSubmit = (values: GuardrailFormSchemaValues) => {
    onSubmit(toFormValues(values));
  };

  const handleTestExternal = () => {
    externalTest?.onTest(toFormValues(form.getValues()));
  };

  const handlePresetsChange = (nextPresets: GatewayGuardrailPreset[]) => {
    form.setValue("presets", nextPresets, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleSecretPrefixesChange = (nextPrefixes: string[]) => {
    form.setValue("secretPrefixes", nextPrefixes, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.trigger("presets").catch(() => undefined);
  };

  const limitFeedbackReason = getLimitFeedbackReason(errorMessage);
  const handleBannerContactSupport = () => {
    if (limitFeedbackReason) onContactSupport?.(limitFeedbackReason);
  };
  const handleRuleSizeContactSupport = () => {
    onContactSupport?.("rule_size");
  };
  const showBannerDocsLink = isExternalGuardrailAlternativeError(errorMessage);
  const bannerActions: BannerAction[] = [
    ...(limitFeedbackReason && onContactSupport
      ? [
          {
            text: "Share feedback with support",
            icon: LifeBuoy,
            onClick: handleBannerContactSupport,
          },
        ]
      : []),
    ...(showBannerDocsLink
      ? [
          {
            text: "Guardrails docs",
            href: GATEWAY_GUARDRAILS_DOCS_URL,
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t text-sm leading-relaxed md:flex-row md:overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col p-5 md:overflow-y-auto">
          {externalTemplate ? (
            <p className="text-muted-foreground mb-4 text-xs leading-relaxed">
              {externalTemplate.description}{" "}
              <TextLink
                path={externalTemplate.docsHref}
                value={externalTemplate.docsLabel}
                icon={SquareArrowOutUpRight}
                external
              />
            </p>
          ) : null}
          <Form
            id={formId}
            density="compact"
            actions={[]}
            onSubmit={form.handleSubmit(handleValidSubmit)}
          >
            {templateNotice ? (
              <Banner variant="info">{templateNotice}</Banner>
            ) : null}
            <FormField control={form.control} name="name" label="Name">
              {({ id, inputDescribedById, error, ...field }) => (
                <Input
                  {...field}
                  id={id}
                  aria-describedby={inputDescribedById}
                  aria-invalid={Boolean(error)}
                  error={Boolean(error)}
                  placeholder={
                    isExternal ? "e.g. Content safety" : "e.g. Block SSNs"
                  }
                />
              )}
            </FormField>

            <TemplateRuleFields
              templateKind={templateKind}
              control={form.control}
              availablePresets={availablePresets}
              selectedPresets={selectedPresets}
              secretPrefixes={secretPrefixes}
              containsEntryCount={parsedContains.length}
              customRegexLength={customRegex.length}
              customRegexErrorMessage={customRegexServerError}
              customRegexErrorCode={customRegexServerErrorCode}
              hasSavedApiKey={hasSavedApiKey}
              presetErrorMessage={
                form.formState.errors.presets?.message ??
                form.formState.errors.secretPrefixes?.message
              }
              onPresetsChange={handlePresetsChange}
              onSecretPrefixesChange={handleSecretPrefixesChange}
              onCustomRegexChange={handleCustomRegexChange}
              onContactSupport={
                onContactSupport ? handleRuleSizeContactSupport : undefined
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CustomTooltip
                content={
                  <span>
                    {GATEWAY_GUARDRAIL_ACTION_DESCRIPTIONS[selectedAction]}
                  </span>
                }
              >
                {({ getTriggerProps }) => (
                  <FormField
                    control={form.control}
                    name="action"
                    label="On match"
                    registerLabelTooltip={getTriggerProps}
                  >
                    {({
                      id,
                      inputDescribedById,
                      error,
                      value,
                      onChange,
                      onBlur,
                    }) => (
                      <SelectInput
                        id={id}
                        aria-describedby={inputDescribedById}
                        aria-invalid={Boolean(error)}
                        error={Boolean(error)}
                        placeholder="Select action"
                        value={value}
                        onValueChange={(nextValue) => {
                          onChange(nextValue);
                          const currentScope = form.getValues("scope");
                          const nextScope = resolveSupportedGuardrailScope(
                            nextValue,
                            currentScope,
                          );
                          if (nextScope !== currentScope) {
                            form.setValue("scope", nextScope, {
                              shouldValidate: true,
                            });
                          }
                          if (capabilities.supportsRedactionLabel) {
                            form
                              .trigger("redactionLabel")
                              .catch(() => undefined);
                          }
                        }}
                        onBlur={onBlur}
                        options={ACTION_OPTIONS_BY_TYPE[guardrailType]}
                      />
                    )}
                  </FormField>
                )}
              </CustomTooltip>

              <CustomTooltip
                content={
                  <span>
                    {GATEWAY_GUARDRAIL_SCOPE_DESCRIPTIONS[selectedScope]}
                  </span>
                }
              >
                {({ getTriggerProps }) => (
                  <FormField
                    control={form.control}
                    name="scope"
                    label="Runs on"
                    registerLabelTooltip={getTriggerProps}
                  >
                    {({
                      id,
                      inputDescribedById,
                      error,
                      value,
                      onChange,
                      onBlur,
                    }) => (
                      <SelectInput
                        id={id}
                        aria-describedby={inputDescribedById}
                        aria-invalid={Boolean(error)}
                        error={Boolean(error)}
                        placeholder="Select scope"
                        value={value}
                        onValueChange={onChange}
                        onBlur={onBlur}
                        options={
                          supportsEntireInputScope(selectedAction)
                            ? SCOPE_OPTIONS_ALL
                            : SCOPE_OPTIONS_BLOCK
                        }
                      />
                    )}
                  </FormField>
                )}
              </CustomTooltip>
            </div>

            {checksOutput ? (
              <Banner variant="info">
                Streaming is turned off when checking output.
              </Banner>
            ) : null}

            {capabilities.supportsRedactionLabel &&
            selectedAction === "REDACT" ? (
              <CustomTooltip
                content={
                  <span>Matched spans are replaced with this label.</span>
                }
              >
                {({ getTriggerProps }) => (
                  <FormField
                    control={form.control}
                    name="redactionLabel"
                    label="Replacement label"
                    registerLabelTooltip={getTriggerProps}
                  >
                    {({ id, inputDescribedById, error, ...field }) => (
                      <Input
                        {...field}
                        id={id}
                        aria-describedby={inputDescribedById}
                        aria-invalid={Boolean(error)}
                        error={Boolean(error)}
                        placeholder="e.g. [REDACTED] or [PHONE]"
                      />
                    )}
                  </FormField>
                )}
              </CustomTooltip>
            ) : null}

            <FormField control={form.control} name="targets" label="Applies to">
              {({ id, inputDescribedById, error, value, onChange }) => (
                <GatewayGuardrailTargetsInput
                  id={id}
                  describedById={inputDescribedById}
                  value={value}
                  onChange={onChange}
                  picker={targetPicker}
                  error={Boolean(error)}
                />
              )}
            </FormField>

            {errorMessage !== null ? (
              <Banner
                variant="error"
                title="Guardrail could not be saved"
                actions={bannerActions.length > 0 ? bannerActions : undefined}
              >
                {errorMessage}
              </Banner>
            ) : null}
          </Form>
        </div>

        {!isExternal ? (
          <aside className="border-border flex shrink-0 flex-col border-t p-5 md:w-88 md:overflow-y-auto md:border-t-0 md:border-l lg:w-96">
            <GatewayGuardrailTestInput
              value={testText}
              onChange={handleTestTextChange}
              presets={
                templateKind === "contains" || isCustomRegex
                  ? []
                  : selectedPresets
              }
              secretPrefixes={
                templateKind === "secrets" ? secretPrefixes : undefined
              }
              containsWords={
                templateKind === "contains" ? parsedContains : undefined
              }
              customMatches={isCustomRegex ? customRegexMatches : undefined}
              customMatchesTruncated={
                isCustomRegex ? customRegexTruncated : undefined
              }
              usesGatewayPreview={isCustomRegex}
            />
          </aside>
        ) : null}
      </div>

      <footer className="bg-modal flex shrink-0 flex-col-reverse gap-2 rounded-b-lg border-t px-5 py-3.5 sm:flex-row sm:justify-end">
        {externalTest?.outcome ? (
          <ConnectionTestStatus
            status={externalTest.outcome.status}
            failure={externalTest.outcome.failure}
          />
        ) : null}
        {externalTest ? (
          <Button
            type="button"
            variant="secondary"
            text={
              externalTest.outcome && externalTest.outcome.status !== "pending"
                ? "Test again"
                : "Test"
            }
            loading={isTesting}
            disabled={!canTestExternal || isBusy}
            onClick={handleTestExternal}
          />
        ) : null}
        <Button
          type="submit"
          form={formId}
          variant="primary"
          text={submitLabel}
          loading={isSubmitting}
          disabled={
            !form.formState.isValid || Boolean(customRegexServerError) || isBusy
          }
        />
      </footer>
    </>
  );
}

type TemplateRuleFieldsProps = {
  templateKind: GatewayGuardrailTemplateKind;
  control: Control<GuardrailFormSchemaValues>;
  availablePresets: readonly GatewayGuardrailPreset[];
  selectedPresets: readonly GatewayGuardrailPreset[];
  secretPrefixes: readonly string[];
  containsEntryCount: number;
  customRegexLength: number;
  customRegexErrorMessage?: string;
  customRegexErrorCode?: string;
  hasSavedApiKey: boolean;
  presetErrorMessage?: string;
  onPresetsChange: (presets: GatewayGuardrailPreset[]) => void;
  onSecretPrefixesChange: (prefixes: string[]) => void;
  onCustomRegexChange: (pattern: string) => void;
  onContactSupport?: () => void;
};

function TemplateRuleFields({
  templateKind,
  control,
  availablePresets,
  selectedPresets,
  secretPrefixes,
  containsEntryCount,
  customRegexLength,
  customRegexErrorMessage,
  customRegexErrorCode,
  hasSavedApiKey,
  presetErrorMessage,
  onPresetsChange,
  onSecretPrefixesChange,
  onCustomRegexChange,
  onContactSupport,
}: TemplateRuleFieldsProps) {
  if (templateKind === "bedrock") {
    return (
      <BedrockGuardrailFields
        control={control}
        hasSavedApiKey={hasSavedApiKey}
      />
    );
  }
  if (templateKind === "openai_moderation") {
    return (
      <OpenAiModerationGuardrailFields
        control={control}
        hasSavedApiKey={hasSavedApiKey}
      />
    );
  }
  if (templateKind === "contains") {
    return (
      <Controller
        control={control}
        name="containsText"
        render={({ field, fieldState }) => (
          <ContainsWordListField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            entryCount={containsEntryCount}
            errorMessage={fieldState.error?.message}
          />
        )}
      />
    );
  }
  if (templateKind === "custom_regex") {
    return (
      <Controller
        control={control}
        name="customRegex"
        render={({ field, fieldState }) => (
          <CustomRegexField
            value={field.value}
            onChange={(nextValue) => {
              field.onChange(nextValue);
              onCustomRegexChange(nextValue);
            }}
            onBlur={field.onBlur}
            charCount={customRegexLength}
            errorMessage={fieldState.error?.message ?? customRegexErrorMessage}
            errorCode={
              fieldState.error?.message ? undefined : customRegexErrorCode
            }
            onContactSupport={onContactSupport}
          />
        )}
      />
    );
  }
  return (
    <PresetMultiSelectField
      availablePresets={availablePresets}
      selectedPresets={selectedPresets}
      secretPrefixes={templateKind === "secrets" ? secretPrefixes : []}
      allowCustomPrefixes={templateKind === "secrets"}
      onPresetsChange={onPresetsChange}
      onSecretPrefixesChange={onSecretPrefixesChange}
      errorMessage={presetErrorMessage}
    />
  );
}

type BedrockGuardrailFieldsProps = {
  control: Control<GuardrailFormSchemaValues>;
  hasSavedApiKey: boolean;
};

function BedrockGuardrailFields({
  control,
  hasSavedApiKey,
}: BedrockGuardrailFieldsProps) {
  return (
    <>
      <CustomTooltip
        content={<span>ID or ARN of your guardrail in Amazon Bedrock.</span>}
      >
        {({ getTriggerProps }) => (
          <FormField
            control={control}
            name="bedrockGuardrailId"
            label="Guardrail ID"
            registerLabelTooltip={getTriggerProps}
          >
            {({ id, inputDescribedById, error, ...field }) => (
              <Input
                {...field}
                id={id}
                aria-describedby={inputDescribedById}
                aria-invalid={Boolean(error)}
                error={Boolean(error)}
                placeholder="e.g. abc123def456 or arn:aws:bedrock:..."
              />
            )}
          </FormField>
        )}
      </CustomTooltip>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CustomTooltip
          content={
            <span>
              Published version (e.g. 1) or DRAFT for the working draft.
            </span>
          }
        >
          {({ getTriggerProps }) => (
            <FormField
              control={control}
              name="bedrockGuardrailVersion"
              label="Version"
              registerLabelTooltip={getTriggerProps}
            >
              {({ id, inputDescribedById, error, ...field }) => (
                <Input
                  {...field}
                  id={id}
                  aria-describedby={inputDescribedById}
                  aria-invalid={Boolean(error)}
                  error={Boolean(error)}
                  placeholder="e.g. 1 or DRAFT"
                />
              )}
            </FormField>
          )}
        </CustomTooltip>

        <FormField control={control} name="bedrockRegion" label="AWS region">
          {({ id, inputDescribedById, error, value, onChange, onBlur }) => (
            <RegionSelect
              id={id}
              aria-describedby={inputDescribedById}
              aria-invalid={Boolean(error)}
              error={Boolean(error)}
              groups={bedrockRegionGroups}
              value={value}
              onChange={onChange}
              onBlur={onBlur}
            />
          )}
        </FormField>
      </div>

      <ExternalApiKeyField
        control={control}
        hasSavedApiKey={hasSavedApiKey}
        tooltip={{
          docsHref:
            "https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html",
          docsLabel: "Amazon Bedrock API keys",
          note: "Needs the bedrock:ApplyGuardrail permission in the selected region.",
        }}
      />
    </>
  );
}

type OpenAiModerationGuardrailFieldsProps = {
  control: Control<GuardrailFormSchemaValues>;
  hasSavedApiKey: boolean;
};

function OpenAiModerationGuardrailFields({
  control,
  hasSavedApiKey,
}: OpenAiModerationGuardrailFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <CustomTooltip
        content={
          <span>
            EU requires an OpenAI project with EU data residency enabled.
          </span>
        }
      >
        {({ getTriggerProps }) => (
          <FormField
            control={control}
            name="openAiModerationRegion"
            label="Region"
            registerLabelTooltip={getTriggerProps}
          >
            {({ id, inputDescribedById, error, value, onChange, onBlur }) => (
              <SelectInput
                id={id}
                aria-describedby={inputDescribedById}
                aria-invalid={Boolean(error)}
                error={Boolean(error)}
                placeholder="Select region"
                value={value}
                onValueChange={onChange}
                onBlur={onBlur}
                options={OPENAI_MODERATION_REGION_OPTIONS}
              />
            )}
          </FormField>
        )}
      </CustomTooltip>

      <ExternalApiKeyField
        control={control}
        hasSavedApiKey={hasSavedApiKey}
        tooltip={{
          docsHref: "https://platform.openai.com/api-keys",
          docsLabel: "OpenAI API keys",
          note: "Use a key from the project matching the region.",
        }}
      />
    </div>
  );
}

type ExternalApiKeyFieldProps = {
  control: Control<GuardrailFormSchemaValues>;
  hasSavedApiKey: boolean;
  /** Where to get the key, and what it needs or limits. */
  tooltip: { docsHref: string; docsLabel: string; note: string };
};

function ExternalApiKeyField({
  control,
  hasSavedApiKey,
  tooltip,
}: ExternalApiKeyFieldProps) {
  return (
    <CustomTooltip
      content={
        <span>
          Use{" "}
          <TextLink
            path={tooltip.docsHref}
            value={tooltip.docsLabel}
            icon={SquareArrowOutUpRight}
            external
          />
          . {tooltip.note}
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <FormField
          control={control}
          name="apiKey"
          label="API key"
          registerLabelTooltip={getTriggerProps}
        >
          {({ id, inputDescribedById, error, ...field }) => (
            <PasswordInput
              {...field}
              id={id}
              autoComplete="new-password"
              aria-describedby={inputDescribedById}
              aria-invalid={Boolean(error)}
              error={Boolean(error)}
              placeholder={
                hasSavedApiKey
                  ? "Leave blank to keep current key"
                  : "Enter API key"
              }
            />
          )}
        </FormField>
      )}
    </CustomTooltip>
  );
}

type PresetMultiSelectFieldProps = {
  availablePresets: readonly GatewayGuardrailPreset[];
  selectedPresets: readonly GatewayGuardrailPreset[];
  secretPrefixes: readonly string[];
  allowCustomPrefixes: boolean;
  onPresetsChange: (presets: GatewayGuardrailPreset[]) => void;
  onSecretPrefixesChange: (prefixes: string[]) => void;
  errorMessage?: string;
};

function PresetMultiSelectField({
  availablePresets,
  selectedPresets,
  secretPrefixes,
  allowCustomPrefixes,
  onPresetsChange,
  onSecretPrefixesChange,
  errorMessage,
}: PresetMultiSelectFieldProps) {
  const inputId = useId();
  const errorId = useId();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const selectedItems = useMemo<MultiSelectTagOption<string>[]>(
    () => [
      ...selectedPresets.map((preset) => ({
        value: `${PRESET_VALUE_PREFIX}${preset}`,
        label: GATEWAY_GUARDRAIL_PRESET_LABELS[preset],
      })),
      ...(allowCustomPrefixes
        ? secretPrefixes.map((prefix) => ({
            value: `${CUSTOM_PREFIX_VALUE_PREFIX}${prefix}`,
            label: prefix,
            secondaryLabel: "Custom prefix",
          }))
        : []),
    ],
    [allowCustomPrefixes, secretPrefixes, selectedPresets],
  );

  const options = useMemo<MultiSelectTagOption<string>[]>(() => {
    const needle = trimmed.toLowerCase();

    const presetOptions: MultiSelectTagOption<string>[] = availablePresets
      .filter((preset) => {
        if (!needle) return true;
        const label = GATEWAY_GUARDRAIL_PRESET_LABELS[preset].toLowerCase();
        return label.includes(needle) || preset.toLowerCase().includes(needle);
      })
      .map((preset) => ({
        value: `${PRESET_VALUE_PREFIX}${preset}`,
        label: GATEWAY_GUARDRAIL_PRESET_LABELS[preset],
      }));

    const customPrefixOptions: MultiSelectTagOption<string>[] =
      allowCustomPrefixes
        ? secretPrefixes
            .filter(
              (prefix) => !needle || prefix.toLowerCase().includes(needle),
            )
            .map((prefix) => ({
              value: `${CUSTOM_PREFIX_VALUE_PREFIX}${prefix}`,
              label: prefix,
              secondaryLabel: "Custom prefix",
            }))
        : [];

    const baseOptions = [...presetOptions, ...customPrefixOptions];

    if (!allowCustomPrefixes || !trimmed || secretPrefixes.includes(trimmed)) {
      return baseOptions;
    }

    if (secretPrefixes.length >= GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES) {
      return [
        ...baseOptions,
        {
          value: `${ADD_PREFIX_VALUE_PREFIX}limit`,
          label: `Add custom prefix`,
          secondaryLabel: `Max ${GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES} reached`,
          disabled: true,
        },
      ];
    }

    const prefixError = validateSecretPrefix(trimmed);
    if (prefixError) {
      return [
        ...baseOptions,
        {
          value: `${ADD_PREFIX_VALUE_PREFIX}invalid`,
          label: `Add custom prefix`,
          secondaryLabel: prefixError,
          disabled: true,
        },
      ];
    }

    return [
      ...baseOptions,
      {
        value: `${ADD_PREFIX_VALUE_PREFIX}${trimmed}`,
        label: `+ Add custom prefix`,
        secondaryLabel: trimmed,
      },
    ];
  }, [allowCustomPrefixes, availablePresets, secretPrefixes, trimmed]);

  const handleValueChange = (nextItems: MultiSelectTagOption<string>[]) => {
    const nextPresets: GatewayGuardrailPreset[] = [];
    const nextPrefixes: string[] = [];
    let addedCustomPrefix = false;

    for (const item of nextItems) {
      if (item.value.startsWith(PRESET_VALUE_PREFIX)) {
        const preset = item.value.slice(
          PRESET_VALUE_PREFIX.length,
        ) as GatewayGuardrailPreset;
        nextPresets.push(preset);
      } else if (item.value.startsWith(CUSTOM_PREFIX_VALUE_PREFIX)) {
        const prefix = item.value.slice(CUSTOM_PREFIX_VALUE_PREFIX.length);
        if (!nextPrefixes.includes(prefix)) nextPrefixes.push(prefix);
      } else if (item.value.startsWith(ADD_PREFIX_VALUE_PREFIX)) {
        const prefix = item.value.slice(ADD_PREFIX_VALUE_PREFIX.length);
        if (
          !nextPrefixes.includes(prefix) &&
          nextPrefixes.length < GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES
        ) {
          nextPrefixes.push(prefix);
          addedCustomPrefix = true;
        }
      }
    }

    if (addedCustomPrefix) setQuery("");
    onPresetsChange(nextPresets);
    if (allowCustomPrefixes) onSecretPrefixesChange(nextPrefixes);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-sm leading-none font-bold">
          Detect
        </label>
        {allowCustomPrefixes ? (
          <CustomTooltip
            content={
              <span>
                Search known secrets or type to add up to{" "}
                {GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES} custom prefixes.
              </span>
            }
          >
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                icon={Info}
                label="About Detect"
                size="xs"
                variant="toolbar"
              />
            )}
          </CustomTooltip>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <AsyncMultiSelectTagInput
          id={inputId}
          aria-label="Detect"
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={Boolean(errorMessage)}
          value={selectedItems}
          options={options}
          onValueChange={handleValueChange}
          placeholder={
            allowCustomPrefixes
              ? "Select secrets or add prefixes"
              : "Select patterns"
          }
          search={{
            placeholder: allowCustomPrefixes
              ? "Search secrets or type a custom prefix…"
              : "Search patterns…",
            value: query,
            onValueChange: setQuery,
          }}
          selectAllLabel={trimmed ? undefined : "Select all"}
          emptyMessage={
            allowCustomPrefixes
              ? "Type 3-32 ASCII characters to add a custom prefix."
              : "No matching patterns."
          }
          error={Boolean(errorMessage)}
        />
        {errorMessage ? (
          <p id={errorId} className="text-destructive text-sm">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type ContainsWordListFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  entryCount: number;
  errorMessage?: string;
};

function ContainsWordListField({
  value,
  onChange,
  onBlur,
  entryCount,
  errorMessage,
}: ContainsWordListFieldProps) {
  const inputId = useId();
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor={inputId} className="text-sm leading-none font-bold">
            Words or phrases
          </label>
          <CustomTooltip
            content={
              <span>
                One word or phrase per line (ASCII only, up to{" "}
                {GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH} chars each).
                Matches whole words, case-insensitively.
              </span>
            }
          >
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                icon={Info}
                label="About Words or phrases"
                size="xs"
                variant="toolbar"
              />
            )}
          </CustomTooltip>
        </div>
        <span className="text-muted-foreground text-xs">
          {entryCount} / {GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS}
        </span>
      </div>
      <textarea
        id={inputId}
        rows={4}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        spellCheck={false}
        placeholder={"confidential\ninternal only\ndo not share"}
        aria-invalid={Boolean(errorMessage)}
        className={cn(
          "ph-no-capture bg-background border-input placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 w-full resize-y rounded-md border p-3 font-mono text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2",
          errorMessage &&
            "border-destructive focus-visible:ring-destructive/40 focus-visible:ring-offset-0",
        )}
      />
      {errorMessage ? (
        <p className="text-destructive text-sm">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function getLimitFeedbackReason(
  errorMessage: string | null,
): GatewayGuardrailsLimitFeedbackReason | null {
  switch (errorMessage) {
    case GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE:
      return "count";
    case GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE:
      return "rule_size";
    case GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE:
      return "org_size";
    default:
      return null;
  }
}

function isExternalTemplate(templateKind: GatewayGuardrailTemplateKind) {
  return getGuardrailTypeForTemplate(templateKind) !== "REGEX";
}

function isExternalGuardrailAlternativeError(
  errorMessage: string | null,
): boolean {
  return (
    errorMessage === GATEWAY_GUARDRAIL_UNSUPPORTED_LOOKAROUND_ERROR_MESSAGE ||
    errorMessage ===
      GATEWAY_GUARDRAIL_UNSUPPORTED_BACKREFERENCE_ERROR_MESSAGE ||
    errorMessage === GATEWAY_GUARDRAIL_UNICODE_NOT_ALLOWED_ERROR_MESSAGE ||
    errorMessage === GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE ||
    errorMessage === GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE
  );
}

const REGEX_DOCS_LINK_ERROR_CODES = new Set([
  "unsupported_lookaround",
  "unsupported_backreference",
  "unicode_not_allowed",
  "size_limit_exceeded",
]);

type CustomRegexFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  charCount: number;
  errorMessage?: string;
  errorCode?: string;
  onContactSupport?: () => void;
};

function CustomRegexField({
  value,
  onChange,
  onBlur,
  charCount,
  errorMessage,
  errorCode,
  onContactSupport,
}: CustomRegexFieldProps) {
  const inputId = useId();
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };
  const showSupportLink =
    Boolean(onContactSupport) &&
    (errorCode === "size_limit_exceeded" ||
      errorMessage === GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE);
  const showDocsLink =
    (errorCode !== undefined && REGEX_DOCS_LINK_ERROR_CODES.has(errorCode)) ||
    isExternalGuardrailAlternativeError(errorMessage ?? null);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor={inputId} className="text-sm leading-none font-bold">
            Regular expression
          </label>
          <CustomTooltip
            content={
              <span>
                Rust regex syntax in ASCII mode (up to{" "}
                {GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH} chars). Look-around,
                backreferences, and Unicode classes (\p{"{..}"}) are not
                supported.
              </span>
            }
          >
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                icon={Info}
                label="About Regular expression"
                size="xs"
                variant="toolbar"
              />
            )}
          </CustomTooltip>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {charCount} / {GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH}
        </span>
      </div>
      <textarea
        id={inputId}
        rows={3}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        spellCheck={false}
        placeholder={String.raw`e.g. \bORD-\d{6}\b`}
        aria-invalid={Boolean(errorMessage)}
        className={cn(
          "ph-no-capture bg-background border-input placeholder:text-muted-foreground focus-visible:ring-ring min-h-20 w-full resize-y rounded-md border p-3 font-mono text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2",
          errorMessage &&
            "border-destructive focus-visible:ring-destructive/40 focus-visible:ring-offset-0",
        )}
      />
      {errorMessage ? (
        <CustomRegexFieldError
          errorMessage={errorMessage}
          showDocsLink={showDocsLink}
          showSupportLink={showSupportLink}
          onContactSupport={onContactSupport}
        />
      ) : null}
    </div>
  );
}

function CustomRegexFieldError({
  errorMessage,
  showDocsLink,
  showSupportLink,
  onContactSupport,
}: {
  errorMessage: string;
  showDocsLink: boolean;
  showSupportLink: boolean;
  onContactSupport?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-destructive text-sm">{errorMessage}</p>
      {(showDocsLink || showSupportLink) && (
        <div className="flex flex-wrap items-center gap-3">
          {showDocsLink && (
            <Button
              variant="text"
              size="sm"
              text="Read docs"
              href={GATEWAY_GUARDRAILS_DOCS_URL}
            />
          )}
          {showSupportLink && (
            <Button
              variant="text"
              size="sm"
              text="Contact support"
              onClick={onContactSupport}
            />
          )}
        </div>
      )}
    </div>
  );
}
