import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import type { GatewaySetupBudgets } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import {
  toGatewaySpendBudgetFormValue,
  toGatewaySpendLimit,
} from "@/src/features/ai-gateway/fns/gatewaySpendBudgetFormValue";
import {
  optionalGatewaySpendBudgetFormSchema,
  type GatewaySpendBudgetFormValue,
} from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";

const budgetStepFormSchema = z.object({
  organization: optionalGatewaySpendBudgetFormSchema,
  user: optionalGatewaySpendBudgetFormSchema,
});

type BudgetStepFormValues = z.infer<typeof budgetStepFormSchema>;

export type BudgetStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  /** The budgets already set, which prefill the form; undefined while loading. */
  budgets: GatewaySetupBudgets | undefined;
  isSaving: boolean;
  errorMessage: string | null;
  /** Why budgets cannot be set; undefined when they can. */
  unavailableReason: string | undefined;
  onSave: (budgets: GatewaySetupBudgets) => void;
  onSkip: () => void;
};

export function BudgetStep({ status, ...bodyProps }: BudgetStepProps) {
  return (
    <Stepper
      number={3}
      title="Set spend budgets"
      status={status}
      isCollapsible={false}
      description="Cap what the whole organization and each member can spend through the gateway. Requests are blocked once a budget is reached."
    >
      {status === "current" ? <BudgetStepBody {...bodyProps} /> : null}
    </Stepper>
  );
}

function BudgetStepBody({
  budgets,
  ...formProps
}: Omit<BudgetStepProps, "status">) {
  // The saved budgets are the form's initial values, so it mounts once they are loaded.
  if (budgets) return <BudgetStepForm budgets={budgets} {...formProps} />;
  // Skipping stays possible while loading, so a failed read cannot block setup.
  return (
    <div className="flex flex-col items-start gap-4 pt-1">
      <Skeleton className="h-20 w-full" />
      <Button
        text="Skip for now"
        variant="secondary"
        onClick={formProps.onSkip}
      />
    </div>
  );
}

function BudgetStepForm({
  budgets,
  unavailableReason,
  isSaving,
  errorMessage,
  onSave,
  onSkip,
}: Omit<BudgetStepProps, "status" | "budgets"> & {
  budgets: GatewaySetupBudgets;
}) {
  const form = useForm<BudgetStepFormValues>({
    resolver: zodResolver(budgetStepFormSchema),
    defaultValues: {
      organization: toGatewaySpendBudgetFormValue(budgets.organization),
      user: toGatewaySpendBudgetFormValue(budgets.user),
    },
    mode: "onChange",
  });
  const { errors } = form.formState;
  const amountError =
    errors.organization?.limitUsd?.message ?? errors.user?.limitUsd?.message;
  const isDisabled = unavailableReason !== undefined;

  const handleSave = form.handleSubmit((values) =>
    onSave({
      organization: toOptionalSpendLimit(values.organization),
      user: toOptionalSpendLimit(values.user),
    }),
  );

  return (
    <div className="ph-no-capture flex flex-col gap-4 pt-1">
      <div className="flex flex-col gap-3">
        <GatewaySpendBudgetField.Row
          control={form.control}
          name="organization"
          label="Organization"
          disabled={isDisabled}
        />
        <GatewaySpendBudgetField.Row
          control={form.control}
          name="user"
          label="Default per user"
          disabled={isDisabled}
        />
      </div>
      {unavailableReason !== undefined ? (
        <p className="text-muted-foreground text-sm">{unavailableReason}</p>
      ) : null}
      {amountError !== undefined ? (
        <p className="text-destructive text-sm">{amountError}</p>
      ) : null}
      {errorMessage !== null ? (
        <Alert variant="destructive">
          <Alert.Title>Budgets could not be saved</Alert.Title>
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          text="Save budgets"
          loading={isSaving}
          disabled={isDisabled || !form.formState.isValid}
          onClick={handleSave}
        />
        <Button
          text="Skip for now"
          variant="secondary"
          disabled={isSaving}
          onClick={onSkip}
        />
      </div>
    </div>
  );
}

/** An empty amount removes the budget, or keeps there being none. */
function toOptionalSpendLimit(value: GatewaySpendBudgetFormValue) {
  return value.limitUsd.trim() === "" ? null : toGatewaySpendLimit(value);
}
