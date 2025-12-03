import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";

export default function CheckboxWidget<
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
  label,
  schema,
  rawErrors = [],
}: WidgetProps<T, S, F>) {
  const _onChange = (checked: boolean) => onChange(checked);
  const _onBlur = () => onBlur(id, value);
  const _onFocus = () => onFocus(id, value);

  const description = schema.description;

  return (
    <div className="flex items-start space-x-2">
      <Checkbox
        id={id}
        checked={typeof value === "undefined" ? false : value}
        disabled={disabled || readonly}
        onCheckedChange={_onChange}
        onBlur={_onBlur}
        onFocus={_onFocus}
        className={cn(rawErrors.length > 0 && "border-destructive")}
      />
      <div className="grid gap-1.5 leading-none">
        {label && (
          <Label
            htmlFor={id}
            className={cn(
              "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
              rawErrors.length > 0 && "text-destructive",
            )}
          >
            {label}
          </Label>
        )}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
