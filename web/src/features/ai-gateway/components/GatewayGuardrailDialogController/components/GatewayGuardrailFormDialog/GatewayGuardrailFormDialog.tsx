import { useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, LifeBuoy } from "@langfuse/icons";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";
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

  return (
    <Dialog
      title={title}
      size="md"
      noCapture
      actions={[
        {
          label: submitLabel,
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled: !form.formState.isValid,
        },
      ]}
    >
      <Dialog.Body>
        {onBack ? (
          <div>
            <Button
              variant="text"
              size="sm"
              icon={ChevronLeft}
              text="Back to templates"
              onClick={onBack}
            />
          </div>
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

          <FormField control={form.control} name="action" label="On match">
            {({ id, inputDescribedById, error, value, onChange, onBlur }) => (
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

          <GatewayGuardrailTestInput
            value={testText}
            onChange={setTestText}
            presets={selectedPresets}
          />

          <div className="border-border flex flex-col gap-4 border-t pt-4">
            <h4 className="text-foreground text-sm font-bold">Where it runs</h4>

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
                        describedById={targetError ? targetsErrorId : undefined}
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
          </div>

          {errorMessage !== null ? (
            <Banner
              variant="error"
              title="Guardrail could not be saved"
              actions={
                onContactSupport &&
                errorMessage === GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE
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
      </Dialog.Body>
    </Dialog>
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
          ? "border-foreground bg-accent/40 text-foreground font-medium"
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
