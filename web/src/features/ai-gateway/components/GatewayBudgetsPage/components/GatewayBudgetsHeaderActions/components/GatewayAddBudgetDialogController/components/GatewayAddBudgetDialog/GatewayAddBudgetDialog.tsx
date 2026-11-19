import { type ComponentProps, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { AsyncMultiSelectTagInput } from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
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
  options: ComponentProps<typeof AsyncMultiSelectTagInput<string>>["options"];
  search: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
};

type GatewayAddBudgetDialogProps = {
  targetType: GatewaySpendTab;
  targetPicker: TargetPicker;
  /** The keys or users the form starts with. */
  initialTargets: GatewayAddBudgetFormValues["targets"];
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
  initialTargets,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
}: GatewayAddBudgetDialogProps) {
  const formId = useId();
  const form = useForm<GatewayAddBudgetFormValues>({
    resolver: zodResolver(gatewayAddBudgetFormSchema),
    defaultValues: {
      targets: initialTargets,
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
              <AsyncMultiSelectTagInput
                id={field.id}
                value={field.value}
                onValueChange={field.onChange}
                options={targetPicker.options}
                placeholder={labels.placeholder}
                search={{
                  placeholder: "Search…",
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
