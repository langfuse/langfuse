import { type ChangeEvent } from "react";
import { InputControl } from "../internal/InputControl/InputControl";

export type DateRangeFieldsValue = {
  from: string;
  to: string;
};

const dateFieldClassName =
  "placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:translate-y-px";

/**
 * Two native date fields in one input frame for an inclusive calendar-day range.
 * The calendar popover with presets lives in DateRangeInput.
 */
export function DateRangeFields({
  value,
  onChange,
  min,
  max,
  fromLabel,
  toLabel,
  disabled,
  error,
}: {
  value: DateRangeFieldsValue;
  onChange: (value: DateRangeFieldsValue) => void;
  /** Earliest selectable day (`yyyy-MM-dd`) for the start field. */
  min?: string;
  /** Latest selectable day (`yyyy-MM-dd`) for the end field. */
  max?: string;
  fromLabel: string;
  toLabel: string;
  disabled?: boolean;
  error?: boolean;
}) {
  const changeBoundary = (boundary: "from" | "to", next: string) => {
    if (next === "") return;
    onChange({ ...value, [boundary]: next });
  };
  const handleFromChange = (event: ChangeEvent<HTMLInputElement>) => {
    changeBoundary("from", event.target.value);
  };
  const handleToChange = (event: ChangeEvent<HTMLInputElement>) => {
    changeBoundary("to", event.target.value);
  };

  return (
    <div className="w-fit max-w-full">
      <InputControl
        contentLayout="text"
        height="fixed"
        focusTarget="within"
        error={error}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <input
            aria-invalid={error ? true : undefined}
            aria-label={fromLabel}
            className={dateFieldClassName}
            data-1p-ignore
            type="date"
            value={value.from}
            min={min}
            max={value.to === "" ? max : value.to}
            disabled={disabled}
            onChange={handleFromChange}
          />
          <span className="text-muted-foreground shrink-0" aria-hidden="true">
            →
          </span>
          <input
            aria-invalid={error ? true : undefined}
            aria-label={toLabel}
            className={dateFieldClassName}
            data-1p-ignore
            type="date"
            value={value.to}
            min={value.from === "" ? min : value.from}
            max={max}
            disabled={disabled}
            onChange={handleToChange}
          />
        </div>
      </InputControl>
    </div>
  );
}
