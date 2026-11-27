import { useRef, useState, type ChangeEvent } from "react";
import { CalendarDays } from "@langfuse/icons";
import { InputControl } from "../internal/InputControl/InputControl";

export type DateRangeFieldsValue = {
  from: string;
  to: string;
};

const dateFieldClassName =
  "date-range-fields-input placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed";

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
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const [pickerField, setPickerField] = useState<"from" | "to">("from");

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
  const openCalendar = () => {
    const input = (pickerField === "to" ? toRef : fromRef).current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <div className="w-fit max-w-full">
      {/* The CSS build drops this pseudo-element, so the rule stays in the document. */}
      <style>{`
        .date-range-fields-input::-webkit-calendar-picker-indicator,
        .date-range-fields-input::-moz-calendar-picker-indicator {
          display: none !important;
          width: 0 !important;
          opacity: 0 !important;
          pointer-events: none;
          appearance: none !important;
          -webkit-appearance: none !important;
        }
      `}</style>
      <InputControl
        contentLayout="text"
        height="fixed"
        focusTarget="within"
        error={error}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Open calendar"
            className="focus-visible:ring-ring flex shrink-0 items-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset disabled:cursor-not-allowed"
            disabled={disabled}
            onClick={openCalendar}
          >
            <CalendarDays
              aria-hidden="true"
              size="base"
              color={disabled ? "muted" : "default"}
            />
          </button>
          <input
            ref={fromRef}
            aria-invalid={error ? true : undefined}
            aria-label={fromLabel}
            className={dateFieldClassName}
            data-1p-ignore
            type="date"
            value={value.from}
            min={min}
            max={value.to === "" ? max : value.to}
            disabled={disabled}
            onFocus={() => setPickerField("from")}
            onChange={handleFromChange}
          />
          <span className="text-muted-foreground shrink-0" aria-hidden="true">
            →
          </span>
          <input
            ref={toRef}
            aria-invalid={error ? true : undefined}
            aria-label={toLabel}
            className={dateFieldClassName}
            data-1p-ignore
            type="date"
            value={value.to}
            min={value.from === "" ? min : value.from}
            max={max}
            disabled={disabled}
            onFocus={() => setPickerField("to")}
            onChange={handleToChange}
          />
        </div>
      </InputControl>
    </div>
  );
}
