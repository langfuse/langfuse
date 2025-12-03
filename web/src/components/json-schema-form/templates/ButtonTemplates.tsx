import type {
  FormContextType,
  IconButtonProps,
  RJSFSchema,
  StrictRJSFSchema,
  SubmitButtonProps,
} from "@rjsf/utils";
import { getSubmitButtonOptions } from "@rjsf/utils";
import { Button } from "@/src/components/ui/button";
import { ChevronUp, ChevronDown, Plus, Trash2, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function SubmitButton<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ uiSchema }: SubmitButtonProps<T, S, F>) {
  const {
    submitText,
    norender,
    props: submitButtonProps,
  } = getSubmitButtonOptions<T, S, F>(uiSchema);

  if (norender) {
    return null;
  }

  return (
    <Button type="submit" {...submitButtonProps}>
      {submitText}
    </Button>
  );
}

export function AddButton<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ className, onClick, disabled }: IconButtonProps<T, S, F>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(className)}
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="mr-2 h-4 w-4" />
      Add
    </Button>
  );
}

export function CopyButton<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ className, onClick, disabled }: IconButtonProps<T, S, F>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={onClick}
      disabled={disabled}
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}

export function MoveDownButton<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ className, onClick, disabled }: IconButtonProps<T, S, F>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6", className)}
      onClick={onClick}
      disabled={disabled}
    >
      <ChevronDown className="h-4 w-4" />
    </Button>
  );
}

export function MoveUpButton<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ className, onClick, disabled }: IconButtonProps<T, S, F>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6", className)}
      onClick={onClick}
      disabled={disabled}
    >
      <ChevronUp className="h-4 w-4" />
    </Button>
  );
}

export function RemoveButton<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>({ className, onClick, disabled }: IconButtonProps<T, S, F>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8 text-muted-foreground hover:text-destructive",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
