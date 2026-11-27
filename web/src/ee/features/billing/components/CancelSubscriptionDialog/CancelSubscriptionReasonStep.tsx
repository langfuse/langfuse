import { type Control, Controller, useWatch } from "react-hook-form";

import { FormField } from "@/src/components/design-system/FormField/FormField";
import { RadioCardGroup } from "@/src/components/design-system/RadioCardGroup/RadioCardGroup";
import { Textarea } from "@/src/components/ui/textarea";
import {
  CANCELLATION_NOTE_MAX_LENGTH,
  type CancellationReason,
  type CancellationReasonOption,
} from "@/src/ee/features/billing/utils/cancellationReasons";

export type CancelSubscriptionFormValues = {
  reason: CancellationReason | null;
  note: string;
};

export function CancelSubscriptionReasonStep({
  control,
  reasons,
  onReasonPick,
}: {
  control: Control<CancelSubscriptionFormValues>;
  /** Called with every pick, so the dialog can count changes of mind. */
  onReasonPick: (reason: CancellationReason) => void;
  /** In the order this person sees them. */
  reasons: ReadonlyArray<CancellationReasonOption>;
}) {
  const reason = useWatch({ control, name: "reason" });
  const picked = reasons.find((option) => option.id === reason);
  const options = reasons.map((option) => ({
    value: option.id,
    label: option.label,
  }));

  return (
    <>
      <p className="text-muted-foreground">
        One click. It tells us what to fix.
      </p>
      <Controller
        control={control}
        name="reason"
        render={({ field }) => (
          <RadioCardGroup
            aria-label="Main reason for cancelling"
            orientation="vertical"
            options={options}
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
              onReasonPick(value);
            }}
          />
        )}
      />
      {picked ? (
        // The note is the customer's own words, kept out of session replay.
        <div className="ph-no-capture">
          <FormField
            control={control}
            name="note"
            label="Anything to add? (optional)"
          >
            {({
              id,
              inputDescribedById,
              value,
              onChange,
              onBlur,
              name,
              ref,
            }) => (
              <Textarea
                id={id}
                aria-describedby={inputDescribedById}
                name={name}
                ref={ref}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                placeholder={picked.notePlaceholder}
                maxLength={CANCELLATION_NOTE_MAX_LENGTH}
                rows={3}
                className="resize-none"
              />
            )}
          </FormField>
        </div>
      ) : null}
    </>
  );
}
