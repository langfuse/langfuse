import {
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronLeft,
  Info,
  LifeBuoy,
  SquareArrowOutUpRight,
  X,
} from "@langfuse/icons";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";

import {
  AsyncMultiSelectTagInput,
  type MultiSelectTagOption,
} from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { Banner } from "@/src/components/design-system/Banner/Banner";
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
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
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
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { RegionSelect } from "@/src/features/ai-gateway/components/RegionSelect";
import { bedrockRegionGroups } from "@/src/features/ai-gateway/constants/bedrockRegions";
import {
  GATEWAY_GUARDRAIL_ACTION_LABELS,
  GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH,
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS,
  GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
  GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
  GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES,
  GATEWAY_GUARDRAIL_MAX_TARGETS,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  compileGuardrailConfigPatterns,
  estimateCompiledPatternsBytes,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  GATEWAY_GUARDRAIL_UI_ACTIONS,
  GatewayBedrockGuardrailApiKeySchema,
  GatewayBedrockGuardrailConfigSchema,
  GatewayGuardrailRedactionLabelSchema,
  parseContainsWordsText,
  validateContainsWordsText,
  validateSecretPrefix,
  type GatewayGuardrailPreset,
  type GatewayGuardrailUiAction,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { cn } from "@/src/utils/tailwind";

const ACTION_OPTIONS: Array<{
  value: GatewayGuardrailUiAction;
  label: string;
}> = GATEWAY_GUARDRAIL_UI_ACTIONS.map((value) => ({
  value,
  label: GATEWAY_GUARDRAIL_ACTION_LABELS[value],
}));

const RUNS_ON_OPTIONS = [{ value: "input", label: "Input" }] as const;

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
      bedrockGuardrailId: z.string(),
      bedrockGuardrailVersion: z.string(),
      bedrockRegion: z.string(),
      bedrockApiKey: z.string(),
      action: z.enum(GATEWAY_GUARDRAIL_UI_ACTIONS),
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
      if (values.action === "REDACT") {
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
        const trimmedApiKey = values.bedrockApiKey.trim();
        if (!hasSavedApiKey || trimmedApiKey.length > 0) {
          const apiKeyResult = GatewayBedrockGuardrailApiKeySchema.safeParse(
            values.bedrockApiKey,
          );
          if (!apiKeyResult.success) {
            ctx.addIssue({
              code: "custom",
              path: ["bedrockApiKey"],
              message:
                apiKeyResult.error.issues[0]?.message ??
                "Enter a Bedrock API key",
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
          return;
        }
        const compiledBytes = estimateCompiledPatternsBytes(
          compileGuardrailConfigPatterns({
            containsWords: parseContainsWordsText(values.containsText),
          }),
        );
        if (compiledBytes > GATEWAY_GUARDRAIL_MAX_RULE_BYTES) {
          ctx.addIssue({
            code: "custom",
            path: ["containsText"],
            message:
              "Keyword list is too large for one guardrail. Remove some entries or split across guardrails.",
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
  bedrock?: {
    guardrailId: string;
    guardrailVersion: string;
    region: string;
    apiKey?: string;
  };
  action: GatewayGuardrailUiAction;
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

export type GatewayGuardrailFormDialogProps = {
  title: string;
  submitLabel: string;
  templateKind: GatewayGuardrailTemplateKind;
  availablePresets: readonly GatewayGuardrailPreset[];
  initialValues: GatewayGuardrailFormValues;
  initialTestText?: string;
  /** True when editing an existing external guardrail so a blank key keeps the saved secret. */
  hasSavedApiKey?: boolean;
  externalTest?: ExternalGuardrailTestControl;
  targetPicker: GatewayGuardrailTargetPicker;
  isSubmitting: boolean;
  errorMessage: string | null;
  onBack?: () => void;
  onContactSupport?: () => void;
  onSubmit: (values: GatewayGuardrailFormValues) => void;
};

export function GatewayGuardrailFormDialog({
  title,
  submitLabel,
  templateKind,
  availablePresets,
  initialValues,
  initialTestText = "",
  hasSavedApiKey = false,
  externalTest,
  targetPicker,
  isSubmitting,
  errorMessage,
  onBack,
  onContactSupport,
  onSubmit,
}: GatewayGuardrailFormDialogProps) {
  const formId = useId();
  const container = useLayerContainer("modal");
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);
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
      bedrockGuardrailId: initialValues.bedrock?.guardrailId ?? "",
      bedrockGuardrailVersion: initialValues.bedrock?.guardrailVersion ?? "",
      bedrockRegion: initialValues.bedrock?.region ?? "",
      bedrockApiKey: "",
      action: initialValues.action,
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
  const bedrockGuardrailId = form.watch("bedrockGuardrailId");
  const bedrockGuardrailVersion = form.watch("bedrockGuardrailVersion");
  const bedrockRegion = form.watch("bedrockRegion");
  const bedrockApiKey = form.watch("bedrockApiKey");
  const selectedAction = form.watch("action");
  const parsedContains = useMemo(
    () =>
      templateKind === "contains" ? parseContainsWordsText(containsText) : [],
    [templateKind, containsText],
  );
  const externalTemplate =
    GATEWAY_GUARDRAIL_TEMPLATES.find((template) => template.id === templateKind)
      ?.external ?? null;
  const isExternal = externalTemplate !== null;
  const isTesting = externalTest?.isPending ?? false;
  const isBusy = isSubmitting || isTesting;
  const canTestExternal =
    templateKind === "bedrock" &&
    GatewayBedrockGuardrailConfigSchema.safeParse({
      guardrailId: bedrockGuardrailId,
      guardrailVersion: bedrockGuardrailVersion,
      region: bedrockRegion,
    }).success &&
    (hasSavedApiKey
      ? bedrockApiKey.trim().length === 0 ||
        GatewayBedrockGuardrailApiKeySchema.safeParse(bedrockApiKey).success
      : GatewayBedrockGuardrailApiKeySchema.safeParse(bedrockApiKey).success);

  const toFormValues = (
    values: GuardrailFormSchemaValues,
  ): GatewayGuardrailFormValues => {
    const redactionLabel =
      values.action === "REDACT" ? values.redactionLabel.trim() : undefined;
    if (templateKind === "bedrock") {
      const apiKey = values.bedrockApiKey.trim();
      return {
        name: values.name.trim(),
        presets: [],
        secretPrefixes: [],
        containsWords: [],
        bedrock: {
          guardrailId: values.bedrockGuardrailId.trim(),
          guardrailVersion: values.bedrockGuardrailVersion.trim(),
          region: values.bedrockRegion.trim(),
          ...(apiKey ? { apiKey } : {}),
        },
        action: values.action,
        redactionLabel,
        targets: values.targets,
      };
    }
    return {
      name: values.name.trim(),
      presets:
        templateKind === "contains" ? initialValues.presets : values.presets,
      secretPrefixes:
        templateKind === "secrets"
          ? values.secretPrefixes
          : initialValues.secretPrefixes,
      containsWords:
        templateKind === "contains"
          ? parseContainsWordsText(values.containsText)
          : initialValues.containsWords,
      action: values.action,
      redactionLabel,
      targets: values.targets,
    };
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

  const handleStopClickPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  };

  const handlePreventOutsideClose = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  const showLimitSupportAction =
    Boolean(onContactSupport) &&
    errorMessage === GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE;

  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay
        className="fixed inset-0 bg-black/25 dark:bg-black/45"
        onClick={handleStopClickPropagation}
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "ph-no-capture bg-modal fixed top-0 left-0 flex h-dvh w-full flex-col shadow-lg sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[85vh] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
          isExternal ? "sm:max-w-xl" : "sm:max-w-4xl",
        )}
        onClick={handleStopClickPropagation}
        onKeyDown={handleKeyDown}
        onPointerDownOutside={handlePreventOutsideClose}
        onInteractOutside={handlePreventOutsideClose}
      >
        <div className="isolate flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="bg-modal flex shrink-0 items-center justify-between gap-3 rounded-t-lg border-b px-5 py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {onBack ? (
                <button
                  type="button"
                  aria-label="Back to guardrail types"
                  onClick={onBack}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring -ml-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                >
                  <ChevronLeft size="base" aria-hidden />
                </button>
              ) : null}
              <DialogPrimitive.Title
                title={title}
                className="min-w-0 flex-1 truncate text-base leading-none font-bold tracking-tight"
              >
                {title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="ring-offset-background focus:ring-ring hover:bg-accent -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
              tabIndex={-1}
            >
              <X size="base" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </header>

          <PopoverLayerProvider container={popoverContainer}>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm leading-relaxed md:flex-row md:overflow-hidden">
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
                    hasSavedApiKey={hasSavedApiKey}
                    presetErrorMessage={
                      form.formState.errors.presets?.message ??
                      form.formState.errors.secretPrefixes?.message
                    }
                    onPresetsChange={handlePresetsChange}
                    onSecretPrefixesChange={handleSecretPrefixesChange}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="action"
                      label="On match"
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
                            form
                              .trigger("redactionLabel")
                              .catch(() => undefined);
                          }}
                          onBlur={onBlur}
                          options={ACTION_OPTIONS}
                        />
                      )}
                    </FormField>

                    <FormField label="Runs on">
                      {({ id, inputDescribedById }) => (
                        <SelectInput
                          id={id}
                          aria-describedby={inputDescribedById}
                          placeholder="Input"
                          value="input"
                          onValueChange={noop}
                          options={[...RUNS_ON_OPTIONS]}
                          disabled
                        />
                      )}
                    </FormField>
                  </div>

                  {selectedAction === "REDACT" ? (
                    <CustomTooltip
                      content={
                        <span>
                          Matched spans in the request are replaced with this
                          label before forwarding.
                        </span>
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

                  <FormField
                    control={form.control}
                    name="targets"
                    label="Applies to"
                  >
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
                      actions={
                        showLimitSupportAction && onContactSupport
                          ? [
                              {
                                text: "Share feedback with support",
                                icon: LifeBuoy,
                                onClick: onContactSupport,
                              },
                            ]
                          : undefined
                      }
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
                    onChange={setTestText}
                    presets={templateKind === "contains" ? [] : selectedPresets}
                    secretPrefixes={
                      templateKind === "secrets" ? secretPrefixes : undefined
                    }
                    containsWords={
                      templateKind === "contains" ? parsedContains : undefined
                    }
                  />
                </aside>
              ) : null}
            </div>
          </PopoverLayerProvider>

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
                  externalTest.outcome &&
                  externalTest.outcome.status !== "pending"
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
              disabled={!form.formState.isValid || isBusy}
            />
          </footer>
        </div>
        <div
          className="isolate"
          data-layer="popover"
          ref={setPopoverContainer}
        />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

type TemplateRuleFieldsProps = {
  templateKind: GatewayGuardrailTemplateKind;
  control: Control<GuardrailFormSchemaValues>;
  availablePresets: readonly GatewayGuardrailPreset[];
  selectedPresets: readonly GatewayGuardrailPreset[];
  secretPrefixes: readonly string[];
  containsEntryCount: number;
  hasSavedApiKey: boolean;
  presetErrorMessage?: string;
  onPresetsChange: (presets: GatewayGuardrailPreset[]) => void;
  onSecretPrefixesChange: (prefixes: string[]) => void;
};

function TemplateRuleFields({
  templateKind,
  control,
  availablePresets,
  selectedPresets,
  secretPrefixes,
  containsEntryCount,
  hasSavedApiKey,
  presetErrorMessage,
  onPresetsChange,
  onSecretPrefixesChange,
}: TemplateRuleFieldsProps) {
  if (templateKind === "bedrock") {
    return (
      <BedrockGuardrailFields
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

      <CustomTooltip
        content={
          <span>
            Use{" "}
            <TextLink
              path="https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html"
              value="Amazon Bedrock API keys"
              icon={SquareArrowOutUpRight}
              external
            />
            . Needs{" "}
            <code className="bg-muted rounded-md px-1 py-px font-mono text-xs">
              bedrock:ApplyGuardrail
            </code>{" "}
            permission in the selected region.
          </span>
        }
      >
        {({ getTriggerProps }) => (
          <FormField
            control={control}
            name="bedrockApiKey"
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
    </>
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

function noop() {
  // Runs on is locked to Input in this release.
}
