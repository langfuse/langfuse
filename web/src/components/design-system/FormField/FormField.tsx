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

export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  children,
  description,
  label,
  name,
  registerLabelTooltip,
}: {
  control: Control<TFieldValues>;
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
}) {
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
          description ? descriptionId : undefined,
          errorMessage ? errorId : undefined,
        ]
          .filter((value) => value !== undefined)
          .join(" ");
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor={controlId}
                className={
                  errorMessage
                    ? "text-destructive text-sm leading-none font-bold"
                    : "text-sm leading-none font-bold"
                }
              >
                {label}
              </label>
              {registerLabelTooltip ? (
                <button
                  type="button"
                  {...registerLabelTooltip()}
                  aria-label={`About ${label}`}
                >
                  <Info
                    aria-hidden
                    className="text-muted-foreground size-3.5"
                  />
                </button>
              ) : null}
            </div>
            {children({
              ...field,
              error: fieldState.error,
              id: controlId,
              inputDescribedById: inputDescribedById || undefined,
            })}
            {description ? (
              <p id={descriptionId} className="text-muted-foreground text-sm">
                {description}
              </p>
            ) : null}
            {errorMessage ? (
              <p id={errorId} className="text-destructive text-sm font-bold">
                {errorMessage}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
