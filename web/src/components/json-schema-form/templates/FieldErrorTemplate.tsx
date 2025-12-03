import type {
  FieldErrorProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";

export default function FieldErrorTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ errors }: FieldErrorProps<T, S, F>) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1 space-y-1">
      {errors.map((error, index) => (
        <li key={index} className="text-sm text-destructive">
          {error}
        </li>
      ))}
    </ul>
  );
}
