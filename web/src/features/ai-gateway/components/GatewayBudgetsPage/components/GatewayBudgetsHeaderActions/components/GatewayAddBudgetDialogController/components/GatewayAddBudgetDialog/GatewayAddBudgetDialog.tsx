import { type ComponentProps, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { AsyncMultiSelectTagInput } from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { GATEWAY_SPEND_BUDGET_MAX_SUBJECTS } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { createDefaultGatewaySpendBudget } from "@/src/features/ai-gateway/fns/spendLimits/createDefaultGatewaySpendBudget";
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
      "Applies a separate total budget to each user across all their keys.",
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
  options: NonNullable<
    ComponentProps<typeof AsyncMultiSelectTagInput<string>>["options"]
  >;
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
  const targetsId = useId();
  const targetsDescriptionId = useId();
  const targetsErrorId = useId();
  const form = useForm<GatewayAddBudgetFormValues>({
    resolver: zodResolver(gatewayAddBudgetFormSchema),
    defaultValues: {
      targets: initialTargets,
      spendBudget: createDefaultGatewaySpendBudget(),
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
          <Controller
            control={form.control}
            name="targets"
            render={({ field, fieldState }) => {
              const targetError = fieldState.error?.message;
              const describedBy = [
                targetError ? targetsErrorId : undefined,
                targetsDescriptionId,
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={targetsId}
                      className="text-sm leading-none font-bold"
                    >
                      {labels.field}
                    </label>
                    <p
                      id={targetsDescriptionId}
                      className="text-muted-foreground text-sm"
                    >
                      {labels.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <AsyncMultiSelectTagInput
                      id={targetsId}
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
                        targetPicker.isLoading
                          ? { message: "Loading…" }
                          : undefined
                      }
                      emptyMessage="No matches."
                      disabled={unavailableReason !== undefined}
                      error={!!fieldState.error}
                      aria-describedby={describedBy}
                      aria-invalid={!!fieldState.error}
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
          <GatewaySpendBudgetField.Inputs
            subject={GATEWAY_SPEND_TABS[targetType].subject}
            control={form.control}
            disabledReason={unavailableReason}
          />
          {errorMessage !== null ? (
            <Banner variant="error" title="Budgets could not be added">
              {errorMessage}
            </Banner>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
