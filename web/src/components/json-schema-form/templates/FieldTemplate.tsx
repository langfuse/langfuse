import type {
  FieldTemplateProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { getTemplate, getUiOptions } from "@rjsf/utils";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";

export default function FieldTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({
  id,
  label,
  children,
  errors,
  help,
  description,
  hidden,
  required,
  displayLabel,
  registry,
  uiSchema,
  schema,
  rawErrors = [],
}: FieldTemplateProps<T, S, F>) {
  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const DescriptionFieldTemplate = getTemplate<
    "DescriptionFieldTemplate",
    T,
    S,
    F
  >("DescriptionFieldTemplate", registry, uiOptions);

  if (hidden) {
    return <div className="hidden">{children}</div>;
  }

  // Don't show label for boolean fields (checkboxes handle their own label)
  const showLabel = displayLabel && schema.type !== "boolean";

  return (
    <div className="space-y-2">
      {showLabel && label && (
        <Label
          htmlFor={id}
          className={cn(
            "text-sm font-medium leading-none",
            rawErrors.length > 0 && "text-destructive",
          )}
        >
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </Label>
      )}
      {showLabel && description && (
        <DescriptionFieldTemplate
          id={`${id}-description`}
          description={description}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
        />
      )}
      {children}
      {errors}
      {help}
    </div>
  );
}
