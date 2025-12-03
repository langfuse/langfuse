import type {
  TitleFieldProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";

export default function TitleFieldTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ id, title, required }: TitleFieldProps<T, S, F>) {
  return (
    <legend id={id} className="text-base font-semibold leading-7">
      {title}
      {required && <span className="ml-1 text-destructive">*</span>}
    </legend>
  );
}
