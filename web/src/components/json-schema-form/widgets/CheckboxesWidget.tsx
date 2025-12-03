import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";

export default function CheckboxesWidget<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({
  id,
  disabled,
  readonly,
  value,
  onChange,
  onBlur,
  onFocus,
  options,
  rawErrors = [],
}: WidgetProps<T, S, F>) {
  const { enumOptions, enumDisabled, inline } = options;
  const checkboxesValue = Array.isArray(value) ? value : [];

  const _onChange =
    (optionValue: string | number | boolean) => (checked: boolean) => {
      const newValue = checked
        ? [...checkboxesValue, optionValue]
        : checkboxesValue.filter((v) => v !== optionValue);
      onChange(newValue);
    };

  const _onBlur = () => onBlur(id, checkboxesValue);
  const _onFocus = () => onFocus(id, checkboxesValue);

  return (
    <div
      className={cn(
        "flex gap-4",
        inline ? "flex-row flex-wrap" : "flex-col",
        rawErrors.length > 0 && "text-destructive",
      )}
    >
      {Array.isArray(enumOptions) &&
        enumOptions.map((option, index) => {
          const checked = checkboxesValue.includes(option.value);
          const itemDisabled =
            disabled ||
            readonly ||
            (Array.isArray(enumDisabled) &&
              enumDisabled.includes(option.value));
          const checkboxId = `${id}_${index}`;

          return (
            <div key={checkboxId} className="flex items-center space-x-2">
              <Checkbox
                id={checkboxId}
                checked={checked}
                disabled={itemDisabled}
                onCheckedChange={_onChange(option.value)}
                onBlur={_onBlur}
                onFocus={_onFocus}
              />
              <Label
                htmlFor={checkboxId}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {option.label}
              </Label>
            </div>
          );
        })}
    </div>
  );
}
