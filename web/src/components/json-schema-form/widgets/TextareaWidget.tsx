import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";

export default function TextareaWidget<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({
  id,
  placeholder,
  required,
  readonly,
  disabled,
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
  }: React.ChangeEvent<HTMLTextAreaElement>) =>
    onChange(value === "" ? options.emptyValue : value);

  const _onBlur = ({
    target: { value },
  }: React.FocusEvent<HTMLTextAreaElement>) => onBlur(id, value);

  const _onFocus = ({
    target: { value },
  }: React.FocusEvent<HTMLTextAreaElement>) => onFocus(id, value);

  return (
    <Textarea
      id={id}
      placeholder={placeholder}
      autoFocus={autofocus}
      required={required}
      disabled={disabled}
      readOnly={readonly}
      value={value ?? ""}
      rows={options.rows || 5}
      onChange={_onChange}
      onBlur={_onBlur}
      onFocus={_onFocus}
      className={cn(rawErrors.length > 0 && "border-destructive")}
    />
  );
}
