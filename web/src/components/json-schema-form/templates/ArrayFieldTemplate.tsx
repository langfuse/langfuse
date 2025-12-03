import type {
  ArrayFieldTemplateProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from "@rjsf/utils";
import { getUiOptions } from "@rjsf/utils";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export default function ArrayFieldTemplate<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
>(props: ArrayFieldTemplateProps<T, S, F>) {
  const {
    canAdd,
    disabled,
    uiSchema,
    items,
    onAddClick,
    readonly,
    required,
    schema,
    title,
  } = props;

  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const arrayTitle = uiOptions.title || title;
  const arrayDescription =
    (uiOptions.description as string) || schema.description;

  return (
    <fieldset className="space-y-3">
      {arrayTitle && (
        <legend className="text-base font-semibold leading-7">
          {arrayTitle}
          {required && <span className="ml-1 text-destructive">*</span>}
        </legend>
      )}
      {arrayDescription && (
        <p className="text-sm text-muted-foreground">{arrayDescription}</p>
      )}
      <div className="space-y-2">
        {/* In v6, items are already rendered React elements */}
        {items}
      </div>
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("mt-2")}
          disabled={disabled || readonly}
          onClick={onAddClick}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      )}
    </fieldset>
  );
}
