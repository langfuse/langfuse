import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/utils/tailwind";

export default function TextWidget<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({
  id,
  placeholder,
  required,
  readonly,
  disabled,
  type,
  value,
  onChange,
  onBlur,
  onFocus,
  autofocus,
  options,
  rawErrors = [],
}: WidgetProps<T, S, F>) {
  const _onChange = ({
    target: { value },
  }: React.ChangeEvent<HTMLInputElement>) =>
    onChange(value === "" ? options.emptyValue : value);

  const _onBlur = ({ target: { value } }: React.FocusEvent<HTMLInputElement>) =>
    onBlur(id, value);

  const _onFocus = ({
    target: { value },
  }: React.FocusEvent<HTMLInputElement>) => onFocus(id, value);

  const inputType =
    (type || options.inputType || "text") === "string"
      ? "text"
      : `${type || options.inputType}`;

  return (
    <Input
      id={id}
      type={inputType}
      placeholder={placeholder}
      autoFocus={autofocus}
      required={required}
      disabled={disabled}
      readOnly={readonly}
      value={value ?? ""}
      onChange={_onChange}
      onBlur={_onBlur}
      onFocus={_onFocus}
      className={cn(rawErrors.length > 0 && "border-destructive")}
    />
  );
}
