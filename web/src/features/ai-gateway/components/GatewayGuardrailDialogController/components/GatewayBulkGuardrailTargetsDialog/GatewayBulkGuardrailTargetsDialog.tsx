import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import {
  GatewayGuardrailTargetsInput,
  type GatewayGuardrailTargetPicker,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTargetsInput/GatewayGuardrailTargetsInput";
import { GATEWAY_GUARDRAIL_MAX_TARGETS } from "@/src/features/ai-gateway/constants/gatewayGuardrails";

const bulkTargetsFormSchema = z.object({
  targets: z
    .array(z.custom<AsyncAutocompleteOption>())
    .min(1, "Select who these guardrails apply to")
    .max(
      GATEWAY_GUARDRAIL_MAX_TARGETS,
      `Select at most ${GATEWAY_GUARDRAIL_MAX_TARGETS} targets`,
    ),
});

type BulkTargetsFormValues = z.infer<typeof bulkTargetsFormSchema>;

export type GatewayBulkGuardrailTargetsDialogProps = {
  selectedCount: number;
  initialTargets: AsyncAutocompleteOption[];
  targetPicker: GatewayGuardrailTargetPicker;
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (targets: AsyncAutocompleteOption[]) => void;
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
            <Banner variant="error" title="Targets could not be updated">
              {errorMessage}
            </Banner>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
