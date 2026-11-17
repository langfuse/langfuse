import { useId } from "react";
import { useWatch, type Control } from "react-hook-form";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { gatewaySpendBudgetIntervalOptions } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { PresetOption } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/components/PresetOption/PresetOption";
import type { GatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";

type GatewayApiKeySpendBudgetFieldProps = {
  control: Control<GatewayApiKeyFormValues>;
  /** Locks the budget and explains why, e.g. while spend is not recorded. */
  disabledReason?: string;
};

export function GatewayApiKeySpendBudgetField({
  control,
  disabledReason,
}: GatewayApiKeySpendBudgetFieldProps) {
  const radioName = useId();
  const interval = useWatch({ control, name: "spendBudget.interval" });
  const disabled = disabledReason !== undefined;

  return (
    <CustomTooltip
      content={
        <span>
          Caps what requests with this key may cost, in USD. Spend is counted
          from the traces the gateway records.
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <FormField
          label="Spend budget"
          description={
            disabledReason ??
            (interval === "TOTAL"
              ? "Requests with this key are rejected once the limit is reached."
              : "Requests with this key are rejected once the limit is reached, until it resets.")
          }
          registerLabelTooltip={getTriggerProps}
        >
          {(group) => (
            <div
              id={group.id}
              role="group"
              aria-label="Spend budget"
              className="flex flex-wrap items-start gap-4 pt-1"
            >
              <div className="w-32">
                <Form.Field
                  control={control}
                  name="spendBudget.limitUsd"
                  label="Amount"
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
              <Form.Field
                control={control}
                name="spendBudget.interval"
                label="Resets"
              >
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
          )}
        </FormField>
      )}
    </CustomTooltip>
  );
}
