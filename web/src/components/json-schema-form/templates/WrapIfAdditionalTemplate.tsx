import type {
  WrapIfAdditionalTemplateProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { ADDITIONAL_PROPERTY_FLAG } from "@rjsf/utils";

export default function WrapIfAdditionalTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({
  children,
  classNames,
  style,
  disabled,
  readonly,
  schema,
}: WrapIfAdditionalTemplateProps<T, S, F>) {
  const additional = ADDITIONAL_PROPERTY_FLAG in schema;

  // For additional properties, we just wrap with styling
  // The key editing is handled by the parent ObjectFieldTemplate
  if (!additional) {
    return (
      <div className={classNames} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={classNames}
      style={style}
      data-disabled={disabled || readonly}
    >
      {children}
    </div>
  );
}
