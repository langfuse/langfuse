import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";

export default function RadioWidget<
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
  const { enumOptions, enumDisabled } = options;

  const _onChange = (newValue: string) => {
    // Try to convert to number if the original enum values are numbers
    const originalOption = enumOptions?.find(
      (opt) => String(opt.value) === newValue,
    );
    onChange(originalOption ? originalOption.value : newValue);
  };

  const _onBlur = () => onBlur(id, value);
  const _onFocus = () => onFocus(id, value);

  return (
    <RadioGroup
      id={id}
      value={value !== undefined ? String(value) : undefined}
      onValueChange={_onChange}
      onBlur={_onBlur}
      onFocus={_onFocus}
      disabled={disabled || readonly}
      className={cn(
        "flex flex-col gap-2",
        rawErrors.length > 0 && "text-destructive",
      )}
    >
      {Array.isArray(enumOptions) &&
        enumOptions.map((option, index) => {
          const itemDisabled =
            disabled ||
            readonly ||
            (Array.isArray(enumDisabled) &&
              enumDisabled.includes(option.value));
          const radioId = `${id}_${index}`;

          return (
            <div key={radioId} className="flex items-center space-x-2">
              <RadioGroupItem
                value={String(option.value)}
                id={radioId}
                disabled={itemDisabled}
              />
              <Label
                htmlFor={radioId}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {option.label}
              </Label>
            </div>
          );
        })}
    </RadioGroup>
  );
}
