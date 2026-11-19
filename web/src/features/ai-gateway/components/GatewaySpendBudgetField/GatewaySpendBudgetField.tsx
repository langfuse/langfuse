import { useId } from "react";
import { useWatch, type Control } from "react-hook-form";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { gatewaySpendBudgetIntervalOptions } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import type { GatewaySpendBudgetFormValue } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
import { PresetOption } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/components/PresetOption/PresetOption";

type GatewaySpendBudgetFormValues = {
  spendBudget: GatewaySpendBudgetFormValue;
};

const requestsBySubject = {
  key: "requests with this key",
  user: "requests with this user's keys",
  organization: "requests in this organization",
} as const;

type GatewaySpendBudgetFieldProps<T extends GatewaySpendBudgetFormValues> = {
  control: Control<T>;
  /** What the budget caps: one key, all keys of a user, or the whole organization. */
  subject: keyof typeof requestsBySubject;
  /** Locks the budget and explains why, e.g. while spend is not recorded. */
  disabledReason?: string;
};

/** The budget as one labelled group, for forms where it sits among other fields. */
export function GatewaySpendBudgetField<
  T extends GatewaySpendBudgetFormValues,
>({ control, subject, disabledReason }: GatewaySpendBudgetFieldProps<T>) {
  const budget = useSpendBudget(control, subject, disabledReason);

  return (
    <CustomTooltip
      content={
        <span>
          Caps what {requestsBySubject[subject]} may cost, in USD, counted from
          when the budget is set. Daily budgets reset at 00:00 UTC, weekly ones
          on Monday and monthly ones on the 1st.
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <FormField
          label="Spend budget"
          description={budget.description}
          registerLabelTooltip={getTriggerProps}
        >
          {(group) => (
            <div
              id={group.id}
              role="group"
              aria-label="Spend budget"
              className="pt-1"
            >
              <SpendBudgetControls budget={budget} />
            </div>
          )}
        </FormField>
      )}
    </CustomTooltip>
  );
}

/** The budget's amount and reset inputs without a group heading, for forms that are only about the budget. */
function GatewaySpendBudgetInputs<T extends GatewaySpendBudgetFormValues>({
  control,
  subject,
  disabledReason,
}: GatewaySpendBudgetFieldProps<T>) {
  const budget = useSpendBudget(control, subject, disabledReason);

  return (
    <div className="space-y-2">
      <SpendBudgetControls budget={budget} />
      <p className="text-muted-foreground text-sm">{budget.description}</p>
    </div>
  );
}

GatewaySpendBudgetField.Inputs = GatewaySpendBudgetInputs;

type SpendBudget = ReturnType<typeof useSpendBudget>;

function useSpendBudget<T extends GatewaySpendBudgetFormValues>(
  formControl: Control<T>,
  subject: keyof typeof requestsBySubject,
  disabledReason: string | undefined,
) {
  // React Hook Form cannot narrow the paths of a generic form; every form here has `spendBudget`.
  const control =
    formControl as unknown as Control<GatewaySpendBudgetFormValues>;
  const requests = capitalize(requestsBySubject[subject]);
  const interval = useWatch({ control, name: "spendBudget.interval" });
  const description =
    disabledReason ??
    (interval === "TOTAL"
      ? `${requests} are rejected once the budget is reached.`
      : `${requests} are rejected once the budget is reached, until it resets.`);

  return {
    control,
    description,
    disabled: disabledReason !== undefined,
  };
}

function SpendBudgetControls({ budget }: { budget: SpendBudget }) {
  const { control, disabled } = budget;
  const radioName = useId();

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="w-36">
        <Form.Field
          control={control}
          name="spendBudget.limitUsd"
          label="Amount (USD)"
        >
          {(field) => (
            <Input
              id={field.id}
              valuePrefix="$"
              inputMode="decimal"
              placeholder="100"
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={disabled}
              error={!!field.error}
              aria-invalid={!!field.error}
            />
          )}
        </Form.Field>
      </div>
      <Form.Field control={control} name="spendBudget.interval" label="Resets">
        {(field) => (
          <div
            id={field.id}
            role="radiogroup"
            aria-label="Resets"
            aria-disabled={disabled || undefined}
            className="flex flex-wrap gap-2"
          >
            {gatewaySpendBudgetIntervalOptions.map((option) => (
              <PresetOption
                key={option.value}
                name={radioName}
                value={option.value}
                label={option.label}
                checked={field.value === option.value}
                disabled={disabled}
                onSelect={field.onChange}
              />
            ))}
          </div>
        )}
      </Form.Field>
    </div>
  );
}

function capitalize(text: string) {
  return `${text[0]!.toUpperCase()}${text.slice(1)}`;
}
