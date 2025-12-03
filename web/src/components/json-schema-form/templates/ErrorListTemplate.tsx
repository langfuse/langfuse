import type {
  ErrorListProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { AlertCircle } from "lucide-react";

export default function ErrorListTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ errors }: ErrorListProps<T, S, F>) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="font-medium">Validation Errors</span>
      </div>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-destructive">
        {errors.map((error, index) => (
          <li key={index}>{error.stack}</li>
        ))}
      </ul>
    </div>
  );
}
