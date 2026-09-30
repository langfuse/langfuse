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

type StandaloneFormFieldProps = {
  control?: never;
  name?: never;
  children: (field: {
    id: string;
    inputDescribedById: string | undefined;
  }) => ReactElement;
  description?: string;
  label: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
};

function FormFieldLayout({
  label,
  controlId,
  description,
  descriptionId,
  errorMessage,
  errorId,
  registerLabelTooltip,
  children,
}: {
  label: string;
  controlId: string;
  description?: string;
  descriptionId: string;
  errorMessage?: string;
  errorId: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
  children: ReactElement;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={controlId} className="text-sm leading-none font-bold">
          {label}
        </label>
        {registerLabelTooltip ? (
          <button
            type="button"
            {...registerLabelTooltip()}
            aria-label={`About ${label}`}
          >
            <Info aria-hidden className="text-muted-foreground size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="space-y-1">
        {children}
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
}

export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>(props: FormFieldProps<TFieldValues, TName, TTransformedValues>): ReactElement;
export function FormField(props: StandaloneFormFieldProps): ReactElement;
export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>(
  props:
    | FormFieldProps<TFieldValues, TName, TTransformedValues>
    | StandaloneFormFieldProps,
) {
  const id = useId();
  const controlId = `${id}-control`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const { label, description, registerLabelTooltip } = props;

  if (props.control) {
    const { control, name, children } = props;
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
            <FormFieldLayout
              label={label}
              controlId={controlId}
              description={description}
              descriptionId={descriptionId}
              errorMessage={errorMessage}
              errorId={errorId}
              registerLabelTooltip={registerLabelTooltip}
            >
              {children({
                ...field,
                error: fieldState.error,
                id: controlId,
                inputDescribedById: inputDescribedById || undefined,
              })}
            </FormFieldLayout>
          );
        }}
      />
    );
  }

  return (
    <FormFieldLayout
      label={label}
      controlId={controlId}
      description={description}
      descriptionId={descriptionId}
      errorId={errorId}
      registerLabelTooltip={registerLabelTooltip}
    >
      {props.children({
        id: controlId,
        inputDescribedById: description ? descriptionId : undefined,
      })}
    </FormFieldLayout>
  );
}
