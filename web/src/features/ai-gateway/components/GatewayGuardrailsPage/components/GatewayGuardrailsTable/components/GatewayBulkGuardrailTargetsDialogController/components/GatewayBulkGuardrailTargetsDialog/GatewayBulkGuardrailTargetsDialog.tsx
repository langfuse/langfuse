import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";
import {
  GatewayGuardrailTargetsInput,
  type GatewayGuardrailTargetPicker,
} from "@/src/features/ai-gateway/components/GatewayGuardrailTargetsInput/GatewayGuardrailTargetsInput";
import { GATEWAY_GUARDRAIL_MAX_TARGETS } from "@/src/features/ai-gateway/constants/gatewayGuardrails";

const bulkTargetsFormSchema = z.object({
  targets: z
    .array(z.custom<TagAutocompleteOption>())
    .min(1, "Select who these guardrails apply to")
    .max(
      GATEWAY_GUARDRAIL_MAX_TARGETS,
      `Select at most ${GATEWAY_GUARDRAIL_MAX_TARGETS} targets`,
    ),
});

type BulkTargetsFormValues = z.infer<typeof bulkTargetsFormSchema>;

export type GatewayBulkGuardrailTargetsDialogProps = {
  selectedCount: number;
  initialTargets: TagAutocompleteOption[];
  targetPicker: GatewayGuardrailTargetPicker;
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (targets: TagAutocompleteOption[]) => void;
};

export function GatewayBulkGuardrailTargetsDialog({
  selectedCount,
  initialTargets,
  targetPicker,
  isSubmitting,
  errorMessage,
  onSubmit,
}: GatewayBulkGuardrailTargetsDialogProps) {
  const formId = useId();
  const targetsId = useId();
  const targetsErrorId = useId();
  const form = useForm<BulkTargetsFormValues>({
    resolver: zodResolver(bulkTargetsFormSchema),
    defaultValues: { targets: initialTargets },
    mode: "onChange",
  });

  const handleValidSubmit = (values: BulkTargetsFormValues) => {
    onSubmit(values.targets);
  };

  const countLabel =
    selectedCount === 1
      ? "1 selected guardrail"
      : `${selectedCount} selected guardrails`;

  return (
    <Dialog
      title="Set applies to"
      size="md"
      noCapture
      actions={[
        {
          label: "Save changes",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled: !form.formState.isValid,
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
          density="compact"
          actions={[]}
          onSubmit={form.handleSubmit(handleValidSubmit)}
        >
          <p className="text-muted-foreground text-sm">
            Replaces who {countLabel} apply to.
          </p>
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
          {errorMessage !== null ? (
            <Banner variant="error" title="Targets could not be updated">
              {errorMessage}
            </Banner>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
