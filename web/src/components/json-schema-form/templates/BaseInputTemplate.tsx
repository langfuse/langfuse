import type {
  BaseInputTemplateProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { getInputProps } from "@rjsf/utils";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/utils/tailwind";

export default function BaseInputTemplate<
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
  onChangeOverride,
  onBlur,
  onFocus,
  autofocus,
  options,
  schema,
  rawErrors = [],
}: BaseInputTemplateProps<T, S, F>) {
  const inputProps = getInputProps<T, S, F>(schema, type, options);

  const _onChange = ({
    target: { value },
  }: React.ChangeEvent<HTMLInputElement>) =>
    onChange(value === "" ? options.emptyValue : value);

  const _onBlur = ({ target: { value } }: React.FocusEvent<HTMLInputElement>) =>
    onBlur(id, value);

  const _onFocus = ({
    target: { value },
  }: React.FocusEvent<HTMLInputElement>) => onFocus(id, value);

  return (
    <Input
      id={id}
      placeholder={placeholder}
      autoFocus={autofocus}
      required={required}
      disabled={disabled}
      readOnly={readonly}
      value={value ?? ""}
      {...inputProps}
      onChange={onChangeOverride || _onChange}
      onBlur={_onBlur}
      onFocus={_onFocus}
      className={cn(rawErrors.length > 0 && "border-destructive")}
    />
  );
}
