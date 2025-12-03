import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";

export default function SelectWidget<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({
  id,
  placeholder,
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
    // Handle empty value selection
    if (newValue === "__EMPTY__") {
      onChange(undefined);
      return;
    }
    // Try to convert to number if the original enum values are numbers
    const originalOption = enumOptions?.find(
      (opt) => String(opt.value) === newValue,
    );
    onChange(originalOption ? originalOption.value : newValue);
  };

  const _onBlur = () => onBlur(id, value);
  const _onFocus = () => onFocus(id, value);

  const emptyValue = "";
  const hasEmptyOption = enumOptions?.some(
    (opt) => opt.value === "" || opt.value === null || opt.value === undefined,
  );

  return (
    <Select
      value={value !== undefined && value !== null ? String(value) : undefined}
      onValueChange={_onChange}
      disabled={disabled || readonly}
    >
      <SelectTrigger
        id={id}
        onBlur={_onBlur}
        onFocus={_onFocus}
        className={cn(rawErrors.length > 0 && "border-destructive")}
      >
        <SelectValue placeholder={placeholder || "Select an option"} />
      </SelectTrigger>
      <SelectContent>
        {!hasEmptyOption && (
          <SelectItem value="__EMPTY__">{emptyValue || "Select..."}</SelectItem>
        )}
        {Array.isArray(enumOptions) &&
          enumOptions.map((option, index) => {
            const itemDisabled =
              Array.isArray(enumDisabled) &&
              enumDisabled.includes(option.value);

            return (
              <SelectItem
                key={`${id}_${index}`}
                value={String(option.value)}
                disabled={itemDisabled}
              >
                {option.label}
              </SelectItem>
            );
          })}
      </SelectContent>
    </Select>
  );
}
