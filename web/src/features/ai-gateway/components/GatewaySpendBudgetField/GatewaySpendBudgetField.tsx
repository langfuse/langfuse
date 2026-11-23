import { type ComponentProps, type ReactNode, useId } from "react";
import {
  Controller,
  useWatch,
  type Control,
  type ControllerRenderProps,
  type FieldPathByValue,
  type FieldValues,
} from "react-hook-form";
import { Info } from "@langfuse/icons";

import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
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

type TooltipTriggerPropsGetter = Parameters<
  ComponentProps<typeof CustomTooltip>["children"]
>[0]["getTriggerProps"];

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
        <div role="group" aria-label="Spend budget">
          <SpendBudgetSections
            budget={budget}
            subject={subject}
            label="Spend budget"
            registerLabelTooltip={getTriggerProps}
          />
        </div>
      )}
    </CustomTooltip>
  );
}

/** The budget's amount, reset, and alert inputs for forms that are only about the budget. */
function GatewaySpendBudgetInputs<T extends GatewaySpendBudgetFormValues>({
  control,
  subject,
  disabledReason,
}: GatewaySpendBudgetFieldProps<T>) {
  const budget = useSpendBudget(control, subject, disabledReason);

  return (
    <SpendBudgetSections budget={budget} subject={subject} label="Budget" />
  );
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
        render={({ field }) => (
          <IntervalTabs
            ariaLabel={`${label} budget resets`}
            value={field.value}
            disabled={disabled}
            onSelect={field.onChange}
          />
        )}
      />
    </div>
  );
}

GatewaySpendBudgetField.Row = GatewaySpendBudgetRow;

function SpendBudgetSections({
  budget,
  subject,
  label,
  registerLabelTooltip,
}: {
  budget: SpendBudget;
  subject: keyof typeof alertRecipientsBySubject;
  label: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SpendBudgetControls
        budget={budget}
        label={label}
        registerLabelTooltip={registerLabelTooltip}
      />
      <AlertThresholdField
        control={budget.control}
        subject={subject}
        disabled={budget.disabled}
      />
    </div>
  );
}

function SpendBudgetControls({
  budget,
  label,
  registerLabelTooltip,
}: {
  budget: SpendBudget;
  label: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
}) {
  const { control, description, disabled } = budget;
  const amountId = useId();
  const descriptionId = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name="spendBudget.limitUsd"
      render={({ field: amountField, fieldState }) => {
        const errorMessage = fieldState.error?.message;
        const describedBy = [errorMessage ? errorId : undefined, descriptionId]
          .filter(Boolean)
          .join(" ");

        return (
          <BudgetFieldSection
            label={label}
            htmlFor={amountId}
            description={description}
            descriptionId={descriptionId}
            errorMessage={errorMessage}
            errorId={errorId}
            registerLabelTooltip={registerLabelTooltip}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-36 shrink-0">
                <AmountInput
                  id={amountId}
                  ariaDescribedBy={describedBy}
                  field={amountField}
                  hasError={!!fieldState.error}
                  disabled={disabled}
                />
              </div>
              <div className="min-w-[min(100%,22rem)] flex-1">
                <Controller
                  control={control}
                  name="spendBudget.interval"
                  render={({ field: intervalField }) => (
                    <IntervalTabs
                      ariaLabel="Resets"
                      ariaDescribedBy={descriptionId}
                      value={intervalField.value}
                      disabled={disabled}
                      layout="full"
                      onSelect={intervalField.onChange}
                    />
                  )}
                />
              </div>
            </div>
          </BudgetFieldSection>
        );
      }}
    />
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
  const groupId = useId();
  const descriptionId = useId();

  return (
    <Controller
      control={control}
      name="spendBudget.alertThresholds"
      render={({ field }) => (
        <BudgetFieldSection
          label="Email alerts"
          description={`Emails ${alertRecipientsBySubject[subject]} when usage reaches a selected threshold.`}
          descriptionId={descriptionId}
        >
          <AlertThresholdCheckboxes
            id={groupId}
            ariaDescribedBy={descriptionId}
            selected={field.value}
            disabled={disabled}
            onChange={field.onChange}
          />
        </BudgetFieldSection>
      )}
    />
  );
}

function BudgetFieldSection({
  label,
  htmlFor,
  description,
  descriptionId,
  errorMessage,
  errorId,
  registerLabelTooltip,
  children,
}: {
  label: string;
  htmlFor?: string;
  description: string;
  descriptionId: string;
  errorMessage?: string;
  errorId?: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="text-sm leading-none font-bold">
              {label}
            </label>
          ) : (
            <span className="text-sm leading-none font-bold">{label}</span>
          )}
          {registerLabelTooltip ? (
            <button
              type="button"
              {...registerLabelTooltip()}
              aria-label={`About ${label}`}
            >
              <Info aria-hidden size="base" color="muted" />
            </button>
          ) : null}
        </div>
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {children}
        {errorMessage && errorId ? (
          <p id={errorId} className="text-destructive text-sm">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
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
  ariaDescribedBy,
  field,
  hasError,
  disabled,
}: {
  id: string;
  ariaDescribedBy?: string;
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
      aria-describedby={ariaDescribedBy}
      aria-invalid={hasError}
    />
  );
}

function IntervalTabs({
  ariaLabel,
  ariaDescribedBy,
  value,
  disabled,
  layout = "default",
  onSelect,
}: {
  ariaLabel: string;
  ariaDescribedBy?: string;
  value: GatewaySpendBudgetInterval;
  disabled: boolean;
  layout?: "default" | "full";
  onSelect: (value: GatewaySpendBudgetInterval) => void;
}) {
  const handleValueChange = (next: string) => {
    const match = gatewaySpendBudgetIntervalOptions.find(
      (option) => option.value === next,
    );
    if (match) onSelect(match.value);
  };

  return (
    <div aria-describedby={ariaDescribedBy}>
      <Tabs
        activationMode="manual"
        value={value}
        onValueChange={handleValueChange}
      >
        <Tabs.List
          variant="inset"
          size="md"
          layout={layout}
          aria-label={ariaLabel}
        >
          {gatewaySpendBudgetIntervalOptions.map((option) => (
            <Tabs.Trigger
              key={option.value}
              value={option.value}
              label={option.label}
              disabled={disabled}
            />
          ))}
        </Tabs.List>
      </Tabs>
    </div>
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
