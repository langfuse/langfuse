import { Input } from "../Input/Input";

export type DateRangeFieldsValue = {
  from: string;
  to: string;
};

/**
 * Two native date fields for an inclusive calendar-day range.
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

  return (
    <div className="flex w-fit max-w-full items-center gap-2">
      <div className="w-36 min-w-0">
        <Input
          aria-invalid={error || undefined}
          aria-label={fromLabel}
          type="date"
          value={value.from}
          min={min}
          max={value.to === "" ? max : value.to}
          disabled={disabled}
          error={error}
          onChange={(event) => changeBoundary("from", event.target.value)}
        />
      </div>
      <span className="text-muted-foreground" aria-hidden="true">
        →
      </span>
      <div className="w-36 min-w-0">
        <Input
          aria-invalid={error || undefined}
          aria-label={toLabel}
          type="date"
          value={value.to}
          min={value.from === "" ? min : value.from}
          max={max}
          disabled={disabled}
          error={error}
          onChange={(event) => changeBoundary("to", event.target.value)}
        />
      </div>
    </div>
  );
}
