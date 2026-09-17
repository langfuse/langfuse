"use client";

import { Info } from "lucide-react";
import { useId, type ComponentProps, type ReactElement } from "react";
import {
  Controller,
  type ControllerRenderProps,
  type Control,
  type FieldError,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { type CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";

type TooltipTriggerPropsGetter = Parameters<
  ComponentProps<typeof CustomTooltip>["children"]
>[0]["getTriggerProps"];

export type FormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
> = {
  control: Control<TFieldValues, undefined, TTransformedValues>;
  children: (
    field: ControllerRenderProps<TFieldValues, TName> & {
      error: FieldError | undefined;
      id: string;
      inputDescribedById: string | undefined;
    },
  ) => ReactElement;
  description?: string;
  label: string;
  name: TName;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
};

export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  control,
  children,
  description,
  label,
  name,
  registerLabelTooltip,
}: FormFieldProps<TFieldValues, TName, TTransformedValues>) {
  const id = useId();
  const controlId = `${id}-control`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const errorMessage = fieldState.error?.message;
        const inputDescribedById = [
          errorMessage ? errorId : undefined,
          description ? descriptionId : undefined,
        ]
          .filter((value) => value !== undefined)
          .join(" ");
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor={controlId}
                className="text-sm leading-none font-bold"
              >
                {label}
              </label>
              {registerLabelTooltip ? (
                <button
                  type="button"
                  {...registerLabelTooltip()}
                  aria-label={`About ${label}`}
                >
                  <Info aria-hidden className="text-muted-foreground icon-md" />
                </button>
              ) : null}
            </div>
            <div className="space-y-1">
              {children({
                ...field,
                error: fieldState.error,
                id: controlId,
                inputDescribedById: inputDescribedById || undefined,
              })}
              {errorMessage ? (
                <p id={errorId} className="text-destructive text-sm">
                  {errorMessage}
                </p>
              ) : null}
            </div>
            {description ? (
              <p id={descriptionId} className="text-muted-foreground text-sm">
                {description}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
