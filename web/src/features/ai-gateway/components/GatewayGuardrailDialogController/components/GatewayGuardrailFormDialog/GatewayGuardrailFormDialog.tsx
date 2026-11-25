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
import { ChevronLeft, LifeBuoy, X } from "@langfuse/icons";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  AsyncMultiSelectTagInput,
  type MultiSelectTagOption,
} from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { GatewayGuardrailTestInput } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/components/GatewayGuardrailTestInput/GatewayGuardrailTestInput";
import {
  GatewayGuardrailTargetsInput,
  type GatewayGuardrailTargetPicker,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTargetsInput/GatewayGuardrailTargetsInput";
import {
  GATEWAY_GUARDRAIL_PRESET_LABELS,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import {
  GATEWAY_GUARDRAIL_ACTION_LABELS,
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

const PRESET_VALUE_PREFIX = "preset:";
const CUSTOM_PREFIX_VALUE_PREFIX = "prefix:";
const ADD_PREFIX_VALUE_PREFIX = "add-prefix:";

function createGuardrailFormSchema(templateKind: GatewayGuardrailTemplateKind) {
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
      action: z.enum(GATEWAY_GUARDRAIL_UI_ACTIONS),
      targets: z
        .array(z.custom<AsyncAutocompleteOption>())
        .min(1, "Select who this guardrail applies to")
        .max(
          GATEWAY_GUARDRAIL_MAX_TARGETS,
          `Select at most ${GATEWAY_GUARDRAIL_MAX_TARGETS} targets`,
        ),
    })
    .superRefine((values, ctx) => {
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
  action: GatewayGuardrailUiAction;
  targets: AsyncAutocompleteOption[];
};

export type GatewayGuardrailFormDialogProps = {
  title: string;
  submitLabel: string;
  templateKind: GatewayGuardrailTemplateKind;
  availablePresets: readonly GatewayGuardrailPreset[];
  initialValues: GatewayGuardrailFormValues;
  initialTestText?: string;
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
    () => createGuardrailFormSchema(templateKind),
    [templateKind],
  );
  const form = useForm<GuardrailFormSchemaValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues.name,
      presets: initialValues.presets,
      secretPrefixes: initialValues.secretPrefixes,
      containsText: initialValues.containsWords.join("\n"),
      action: initialValues.action,
      targets: initialValues.targets,
    },
    mode: "onChange",
  });

  const selectedPresets = form.watch("presets");
  const secretPrefixes = form.watch("secretPrefixes");
  const containsText = form.watch("containsText");
  const parsedContains = useMemo(
    () =>
      templateKind === "contains" ? parseContainsWordsText(containsText) : [],
    [templateKind, containsText],
  );

  const handleValidSubmit = (values: GuardrailFormSchemaValues) => {
    onSubmit({
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
      targets: values.targets,
    });
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
        className="ph-no-capture bg-modal fixed top-0 left-0 flex h-dvh w-full flex-col shadow-lg sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[85vh] sm:max-w-4xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
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
                        placeholder="e.g. Block SSNs"
                      />
                    )}
                  </FormField>

                  {templateKind === "contains" ? (
                    <Controller
                      control={form.control}
                      name="containsText"
                      render={({ field, fieldState }) => (
                        <ContainsWordListField
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          entryCount={parsedContains.length}
                          errorMessage={fieldState.error?.message}
                        />
                      )}
                    />
                  ) : (
                    <PresetMultiSelectField
                      availablePresets={availablePresets}
                      selectedPresets={selectedPresets}
                      secretPrefixes={
                        templateKind === "secrets" ? secretPrefixes : []
                      }
                      allowCustomPrefixes={templateKind === "secrets"}
                      onPresetsChange={handlePresetsChange}
                      onSecretPrefixesChange={handleSecretPrefixesChange}
                      errorMessage={
                        form.formState.errors.presets?.message ??
                        form.formState.errors.secretPrefixes?.message
                      }
                    />
                  )}

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
                          onValueChange={onChange}
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
            </div>
          </PopoverLayerProvider>

          <footer className="bg-modal flex shrink-0 flex-col-reverse gap-2 rounded-b-lg border-t px-5 py-3.5 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" text="Cancel" disabled={isSubmitting} />
            </DialogPrimitive.Close>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              text={submitLabel}
              loading={isSubmitting}
              disabled={!form.formState.isValid}
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
      <label htmlFor={inputId} className="text-sm leading-none font-bold">
        Detect
      </label>
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
        {!errorMessage && allowCustomPrefixes ? (
          <p className="text-muted-foreground text-xs">
            Search known secrets or type to add up to{" "}
            {GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES} custom prefixes.
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
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm leading-none font-bold">
          Words or phrases
        </label>
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
      ) : (
        <p className="text-muted-foreground text-xs">
          One word or phrase per line (ASCII only, up to{" "}
          {GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH} chars each). Matches
          whole words, case-insensitively.
        </p>
      )}
    </div>
  );
}

function noop() {
  // Runs on is locked to Input in this release.
}
