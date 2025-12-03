import type {
  DescriptionFieldProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";

export default function DescriptionFieldTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ id, description }: DescriptionFieldProps<T, S, F>) {
  if (!description) {
    return null;
  }

  return (
    <p id={id} className="text-sm text-muted-foreground">
      {description}
    </p>
  );
}
