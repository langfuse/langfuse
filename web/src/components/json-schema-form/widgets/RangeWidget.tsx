import type {
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from "@rjsf/utils";
import { Slider } from "@/src/components/ui/slider";
import { cn } from "@/src/utils/tailwind";

export default function RangeWidget<
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
  schema,
  rawErrors = [],
}: WidgetProps<T, S, F>) {
  const sliderValue =
    typeof value === "number" ? [value] : [schema.minimum ?? 0];

  const _onChange = (newValue: number[]) => {
    onChange(newValue[0]);
  };

  const _onBlur = () => onBlur(id, value);
  const _onFocus = () => onFocus(id, value);

  return (
    <div className="flex items-center gap-4">
      <Slider
        id={id}
        value={sliderValue}
        min={schema.minimum ?? 0}
        max={schema.maximum ?? 100}
        step={schema.multipleOf ?? 1}
        disabled={disabled || readonly}
        onValueChange={_onChange}
        onBlur={_onBlur}
        onFocus={_onFocus}
        className={cn("flex-1", rawErrors.length > 0 && "border-destructive")}
      />
      <span className="min-w-[3rem] text-right text-sm text-muted-foreground">
        {value ?? schema.minimum ?? 0}
      </span>
    </div>
  );
}
