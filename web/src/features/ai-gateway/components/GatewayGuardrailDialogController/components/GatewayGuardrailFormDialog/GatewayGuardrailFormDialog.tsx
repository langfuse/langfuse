import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, LifeBuoy, X } from "@langfuse/icons";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import {
  GatewayGuardrailTargetsInput,
  type GatewayGuardrailTargetPicker,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTargetsInput/GatewayGuardrailTargetsInput";
import { GatewayGuardrailTestInput } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTestInput/GatewayGuardrailTestInput";
import {
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
  GATEWAY_GUARDRAIL_MAX_TARGETS,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { GATEWAY_GUARDRAIL_PRESET_LABELS } from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import {
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  GATEWAY_GUARDRAIL_UI_ACTIONS,
  type GatewayGuardrailPreset,
  type GatewayGuardrailUiAction,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { cn } from "@/src/utils/tailwind";

const ACTION_OPTIONS: Array<{
  value: GatewayGuardrailUiAction;
  label: string;
}> = [
  { value: "BLOCK", label: "Block" },
  { value: "LOG", label: "Log" },
];

const RUNS_ON_OPTIONS = [{ value: "input", label: "Input" }] as const;

const guardrailFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this guardrail")
    .max(
      GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
      `Name must be at most ${GATEWAY_GUARDRAIL_MAX_NAME_LENGTH} characters`,
    ),
  presets: z
    .array(z.enum(GATEWAY_GUARDRAIL_PRESET_KEYS))
    .min(1, "Select at least one pattern to detect"),
  action: z.enum(GATEWAY_GUARDRAIL_UI_ACTIONS),
  targets: z
    .array(z.custom<TagAutocompleteOption>())
    .min(1, "Select who this guardrail applies to")
    .max(
      GATEWAY_GUARDRAIL_MAX_TARGETS,
      `Select at most ${GATEWAY_GUARDRAIL_MAX_TARGETS} targets`,
    ),
});

type GuardrailFormValues = z.infer<typeof guardrailFormSchema>;

export type GatewayGuardrailFormValues = {
  name: string;
  presets: GatewayGuardrailPreset[];
  action: GatewayGuardrailUiAction;
  targets: TagAutocompleteOption[];
};

export type GatewayGuardrailFormDialogProps = {
  title: string;
  submitLabel: string;
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
  const targetsId = useId();
  const targetsErrorId = useId();
  const container = useLayerContainer("modal");
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);
  const [testText, setTestText] = useState(initialTestText);

  const form = useForm<GuardrailFormValues>({
    resolver: zodResolver(guardrailFormSchema),
    defaultValues: initialValues,
    mode: "onChange",
  });

  const selectedPresets = form.watch("presets");

  const handleValidSubmit = (values: GuardrailFormValues) => {
    onSubmit({
      name: values.name.trim(),
      presets: values.presets,
      action: values.action,
      targets: values.targets,
    });
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
        className="ph-no-capture bg-modal fixed top-0 left-0 flex h-dvh w-full flex-col shadow-lg sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
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
                  aria-label="Back to templates"
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
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
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

                <Controller
                  control={form.control}
                  name="presets"
                  render={({ field, fieldState }) => (
                    <PresetChecklistField
                      availablePresets={availablePresets}
                      selectedPresets={field.value}
                      onChange={field.onChange}
                      errorMessage={fieldState.error?.message}
                    />
                  )}
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

                <GatewayGuardrailTestInput
                  value={testText}
                  onChange={setTestText}
                  presets={selectedPresets}
                />

                <Controller
                  control={form.control}
                  name="targets"
                  render={({ field, fieldState }) => {
                    const targetError = fieldState.error?.message;
                    return (
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor={targetsId}
                          className="text-sm leading-none font-bold"
                        >
                          Applies to
                        </label>
                        <div className="flex flex-col gap-1">
                          <GatewayGuardrailTargetsInput
                            id={targetsId}
                            describedById={
                              targetError ? targetsErrorId : undefined
                            }
                            value={field.value}
                            onChange={field.onChange}
                            picker={targetPicker}
                            error={Boolean(targetError)}
                          />
                          {targetError ? (
                            <p
                              id={targetsErrorId}
                              className="text-destructive text-sm"
                            >
                              {targetError}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  }}
                />

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

type PresetChecklistFieldProps = {
  availablePresets: readonly GatewayGuardrailPreset[];
  selectedPresets: readonly GatewayGuardrailPreset[];
  onChange: (presets: GatewayGuardrailPreset[]) => void;
  errorMessage?: string;
};

function PresetChecklistField({
  availablePresets,
  selectedPresets,
  onChange,
  errorMessage,
}: PresetChecklistFieldProps) {
  const handleToggle = (preset: GatewayGuardrailPreset) => {
    const isChecked = selectedPresets.includes(preset);
    if (isChecked) {
      onChange(selectedPresets.filter((item) => item !== preset));
      return;
    }
    onChange([...selectedPresets, preset]);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-bold">Detect</span>
      <div className="flex flex-wrap gap-2">
        {availablePresets.map((preset) => (
          <PresetTogglePill
            key={preset}
            preset={preset}
            checked={selectedPresets.includes(preset)}
            onToggle={handleToggle}
          />
        ))}
      </div>
      {errorMessage ? (
        <p className="text-destructive text-sm">{errorMessage}</p>
      ) : null}
    </div>
  );
}

type PresetTogglePillProps = {
  preset: GatewayGuardrailPreset;
  checked: boolean;
  onToggle: (preset: GatewayGuardrailPreset) => void;
};

function PresetTogglePill({
  preset,
  checked,
  onToggle,
}: PresetTogglePillProps) {
  const handleCheckedChange = () => onToggle(preset);

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors select-none",
        checked
          ? "border-foreground bg-background text-foreground font-medium"
          : "border-input text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      <Checkbox
        size="sm"
        checked={checked}
        onCheckedChange={handleCheckedChange}
      />
      <span>{GATEWAY_GUARDRAIL_PRESET_LABELS[preset]}</span>
    </label>
  );
}

function noop() {
  // Runs on is locked to Input in this release.
}
