import { type ComponentProps, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { GATEWAY_SPEND_BUDGET_MAX_SUBJECTS } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { toGatewaySpendLimit } from "@/src/features/ai-gateway/fns/gatewaySpendBudgetFormValue";
import { requiredGatewaySpendBudgetFormSchema } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

const targetLabels = {
  apiKeys: {
    title: "Add key budgets",
    field: "Gateway keys",
    placeholder: "Select keys",
    description: "Each key gets its own budget.",
  },
  users: {
    title: "Add user budgets",
    field: "Users",
    placeholder: "Select users",
    description:
      "Each user gets their own budget, which caps all of their gateway keys in addition to each key's own budget.",
  },
} as const satisfies Record<GatewaySpendTab, Record<string, string>>;

const gatewayAddBudgetFormSchema = z.object({
  targets: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(1, "Select who the budget applies to")
    .max(
      GATEWAY_SPEND_BUDGET_MAX_SUBJECTS,
      `Select at most ${GATEWAY_SPEND_BUDGET_MAX_SUBJECTS} at once`,
    ),
  spendBudget: requiredGatewaySpendBudgetFormSchema,
});

type GatewayAddBudgetFormValues = z.infer<typeof gatewayAddBudgetFormSchema>;

type TargetPicker = {
  options: ComponentProps<typeof MultiSelectTagInput<string>>["options"];
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
};

type GatewayAddBudgetDialogProps = {
  targetType: GatewaySpendTab;
  targetPicker: TargetPicker;
  /** Why a budget cannot be added; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (budget: {
    targetIds: string[];
    spendLimit: GatewaySpendLimit;
  }) => void;
};

/** Adds the same budget to gateway keys, or to users, which caps all of their keys. */
export function GatewayAddBudgetDialog({
  targetType,
  targetPicker,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
}: GatewayAddBudgetDialogProps) {
  const formId = useId();
  const form = useForm<GatewayAddBudgetFormValues>({
    resolver: zodResolver(gatewayAddBudgetFormSchema),
    defaultValues: {
      targets: [],
      spendBudget: { interval: "MONTHLY", limitUsd: "" },
    },
    mode: "onChange",
  });
  const labels = targetLabels[targetType];

  const handleValidSubmit = (values: GatewayAddBudgetFormValues) => {
    onSubmit({
      targetIds: values.targets.map(({ value }) => value),
      spendLimit: toGatewaySpendLimit(values.spendBudget),
    });
  };

  return (
    <Dialog
      title={labels.title}
      size="md"
      noCapture
      actions={[
        {
          label: "Add budgets",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled: unavailableReason !== undefined || !form.formState.isValid,
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
          <Form.Field
            control={form.control}
            name="targets"
            label={labels.field}
            description={labels.description}
          >
            {(field) => (
              <MultiSelectTagInput
                id={field.id}
                value={field.value.map(({ value }) => value)}
                onValueChange={(values) => {
                  const known = [...field.value, ...targetPicker.options];
                  field.onChange(
                    values.map((value) => ({
                      value,
                      label:
                        known.find((option) => option.value === value)?.label ??
                        value,
                    })),
                  );
                }}
                options={withSelectedOptions(field.value, targetPicker.options)}
                placeholder={labels.placeholder}
                searchPlaceholder="Search…"
                search={{
                  value: targetPicker.search,
                  onValueChange: targetPicker.onSearchChange,
                }}
                loading={
                  targetPicker.isLoading ? { message: "Loading…" } : undefined
                }
                emptyMessage="No matches."
                disabled={unavailableReason !== undefined}
                error={!!field.error}
                aria-invalid={!!field.error}
              />
            )}
          </Form.Field>
          <GatewaySpendBudgetField.Inputs
            subject={GATEWAY_SPEND_TABS[targetType].subject}
            control={form.control}
            disabledReason={unavailableReason}
          />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Budgets could not be added</Alert.Title>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}

/** Server search narrows the options, so selected ones outside it are kept to label their tags. */
function withSelectedOptions(
  selected: { value: string; label: string }[],
  options: ComponentProps<typeof MultiSelectTagInput<string>>["options"],
) {
  const listed = new Set(options.map(({ value }) => value));
  return [...selected.filter(({ value }) => !listed.has(value)), ...options];
}
