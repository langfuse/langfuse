import { useId } from "react";
import {
  Controller,
  useWatch,
  type Control,
  type ControllerRenderProps,
  type FieldPathByValue,
  type FieldValues,
} from "react-hook-form";

import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Form } from "@/src/components/design-system/Form/Form";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
  type GatewaySpendBudgetAlertThreshold,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import {
  gatewaySpendBudgetIntervalOptions,
  type GatewaySpendBudgetInterval,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { normalizeGatewaySpendBudgetAlertThresholds } from "@/src/features/ai-gateway/fns/spendLimits/normalizeGatewaySpendBudgetAlertThresholds";
import type { GatewaySpendBudgetFormValue } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";

const requestsBySubject = {
  key: "requests with this key",
  user: "requests with this user's keys",
  organization: "requests in this organization",
} as const;

const alertRecipientsBySubject = {
  key: "the key owner and organization owners",
  user: "the user and organization owners",
  organization: "organization owners",
} as const;

type GatewaySpendBudgetFormValues = {
  spendBudget: GatewaySpendBudgetFormValue;
};

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
        <FormField label="Spend budget" registerLabelTooltip={getTriggerProps}>
          {(group) => (
            <div
              id={group.id}
              role="group"
              aria-label="Spend budget"
              className="pt-1"
            >
              <SpendBudgetSections budget={budget} subject={subject} />
            </div>
          )}
        </FormField>
      )}
    </CustomTooltip>
  );
}

/** The budget's amount, reset, and alert inputs without a group heading, for forms that are only about the budget. */
function GatewaySpendBudgetInputs<T extends GatewaySpendBudgetFormValues>({
  control,
  subject,
  disabledReason,
}: GatewaySpendBudgetFieldProps<T>) {
  const budget = useSpendBudget(control, subject, disabledReason);

  return <SpendBudgetSections budget={budget} subject={subject} />;
}

GatewaySpendBudgetField.Inputs = GatewaySpendBudgetInputs;

/** The budget on one line after a label, for forms that list several budgets. */
function GatewaySpendBudgetRow<T extends FieldValues>({
  control: formControl,
  name,
  label,
  disabled,
}: {
  control: Control<T>;
  /** The form field holding the budget's value. */
  name: FieldPathByValue<T, GatewaySpendBudgetFormValue>;
  label: string;
  disabled: boolean;
}) {
  // React Hook Form cannot narrow the paths of a generic form.
  const control = formControl as unknown as Control<
    Record<string, GatewaySpendBudgetFormValue>
  >;
  const amountId = useId();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={amountId} className="w-37.5 text-sm">
        {label}
      </label>
      <Controller
        control={control}
        name={`${name}.limitUsd`}
        render={({ field, fieldState }) => (
          <div className="w-30">
            <AmountInput
              id={amountId}
              field={field}
              hasError={!!fieldState.error}
              disabled={disabled}
            />
          </div>
        )}
      />
      <Controller
        control={control}
        name={`${name}.interval`}
        render={({ field, fieldState }) => (
          <div className="w-36">
            <IntervalSelect
              ariaLabel={`${label} budget resets`}
              field={field}
              hasError={!!fieldState.error}
              disabled={disabled}
            />
          </div>
        )}
      />
    </div>
  );
}

GatewaySpendBudgetField.Row = GatewaySpendBudgetRow;

function SpendBudgetSections({
  budget,
  subject,
}: {
  budget: SpendBudget;
  subject: keyof typeof alertRecipientsBySubject;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SpendBudgetControls budget={budget} />
        <p className="text-muted-foreground text-sm">{budget.description}</p>
      </div>
      <AlertThresholdField
        control={budget.control}
        subject={subject}
        disabled={budget.disabled}
      />
    </div>
  );
}

function SpendBudgetControls({ budget }: { budget: SpendBudget }) {
  const { control, disabled } = budget;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="w-36">
        <Form.Field
          control={control}
          name="spendBudget.limitUsd"
          label="Amount (USD)"
        >
          {(field) => (
            <AmountInput
              id={field.id}
              field={field}
              hasError={!!field.error}
              disabled={disabled}
            />
          )}
        </Form.Field>
      </div>
      <div className="w-36">
        <Form.Field
          control={control}
          name="spendBudget.interval"
          label="Resets"
        >
          {(field) => (
            <IntervalSelect
              id={field.id}
              ariaDescribedBy={field.inputDescribedById}
              field={field}
              hasError={!!field.error}
              disabled={disabled}
            />
          )}
        </Form.Field>
      </div>
    </div>
  );
}

function AlertThresholdField({
  control,
  subject,
  disabled,
}: {
  control: Control<GatewaySpendBudgetFormValues>;
  subject: keyof typeof alertRecipientsBySubject;
  disabled: boolean;
}) {
  return (
    <Form.Field
      control={control}
      name="spendBudget.alertThresholds"
      label="Email alerts"
      description={`Emails ${alertRecipientsBySubject[subject]} when usage reaches a selected threshold.`}
    >
      {(field) => (
        <AlertThresholdCheckboxes
          id={field.id}
          ariaDescribedBy={field.inputDescribedById}
          selected={field.value}
          disabled={disabled}
          onChange={field.onChange}
        />
      )}
    </Form.Field>
  );
}

function AlertThresholdCheckboxes({
  id,
  ariaDescribedBy,
  selected,
  disabled,
  onChange,
}: {
  id: string;
  ariaDescribedBy: string | undefined;
  selected: readonly GatewaySpendBudgetAlertThreshold[];
  disabled: boolean;
  onChange: (next: GatewaySpendBudgetAlertThreshold[]) => void;
}) {
  const handleToggle = (
    threshold: GatewaySpendBudgetAlertThreshold,
    checked: boolean,
  ) => {
    const next = checked
      ? [...selected, threshold]
      : selected.filter((current) => current !== threshold);
    onChange(normalizeGatewaySpendBudgetAlertThresholds(next));
  };

  return (
    <div
      id={id}
      role="group"
      aria-label="Email alerts"
      aria-describedby={ariaDescribedBy}
      className="flex flex-wrap items-center gap-4"
    >
      {GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS.map((threshold) => (
        <AlertThresholdCheckbox
          key={threshold}
          threshold={threshold}
          checked={selected.includes(threshold)}
          disabled={disabled}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

function AlertThresholdCheckbox({
  threshold,
  checked,
  disabled,
  onToggle,
}: {
  threshold: GatewaySpendBudgetAlertThreshold;
  checked: boolean;
  disabled: boolean;
  onToggle: (
    threshold: GatewaySpendBudgetAlertThreshold,
    checked: boolean,
  ) => void;
}) {
  const id = useId();
  const handleCheckedChange = (next: boolean | "indeterminate") => {
    onToggle(threshold, next === true);
  };

  return (
    <label
      htmlFor={id}
      className={
        disabled
          ? "text-muted-foreground inline-flex cursor-not-allowed items-center gap-2 text-sm"
          : "inline-flex cursor-pointer items-center gap-2 text-sm"
      }
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={handleCheckedChange}
      />
      <span>{threshold}%</span>
    </label>
  );
}

function AmountInput({
  id,
  field,
  hasError,
  disabled,
}: {
  id: string;
  field: Pick<
    ControllerRenderProps<Record<string, string>, string>,
    "name" | "value" | "onChange" | "onBlur" | "ref"
  >;
  hasError: boolean;
  disabled: boolean;
}) {
  return (
    <Input
      id={id}
      valuePrefix="$"
      inputMode="decimal"
      placeholder="100"
      name={field.name}
      value={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      disabled={disabled}
      error={hasError}
      aria-invalid={hasError}
    />
  );
}

function IntervalSelect({
  id,
  ariaLabel,
  ariaDescribedBy,
  field,
  hasError,
  disabled,
}: {
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  field: Pick<
    ControllerRenderProps<Record<string, GatewaySpendBudgetInterval>, string>,
    "value" | "onChange" | "onBlur" | "ref"
  >;
  hasError: boolean;
  disabled: boolean;
}) {
  return (
    <SelectInput<GatewaySpendBudgetInterval>
      id={id}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={hasError}
      error={hasError}
      placeholder="Select reset period"
      options={gatewaySpendBudgetIntervalOptions}
      value={field.value}
      onValueChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      disabled={disabled}
    />
  );
}

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

function capitalize(text: string) {
  return `${text[0]!.toUpperCase()}${text.slice(1)}`;
}
