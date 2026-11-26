"use client";

import { useId, type ComponentProps, type ReactElement } from "react";
import {
  Controller,
  type ControllerRenderProps,
  type Control,
  type FieldError,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FormFieldLayout } from "../internal/FormFieldLayout/FormFieldLayout";

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
  description?: ComponentProps<typeof FormFieldLayout>["description"];
  /** Controlled fields read errors from React Hook Form. */
  error?: never;
  label: string;
  name: TName;
  registerLabelTooltip?: ComponentProps<
    typeof FormFieldLayout
  >["registerLabelTooltip"];
  required?: boolean;
};

type StandaloneFormFieldProps = {
  control?: never;
  name?: never;
  /** Error message for a field without React Hook Form control. */
  error?: string;
  children: (field: {
    id: string;
    inputDescribedById: string | undefined;
  }) => ReactElement;
  description?: ComponentProps<typeof FormFieldLayout>["description"];
  label: string;
  registerLabelTooltip?: ComponentProps<
    typeof FormFieldLayout
  >["registerLabelTooltip"];
  required?: boolean;
};

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
  const { label, registerLabelTooltip, required } = props;
  const description =
    props.description !== undefined && props.description.length > 0
      ? props.description
      : undefined;

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
              variant="field"
              label={label}
              controlId={controlId}
              description={description}
              descriptionId={descriptionId}
              errorMessage={errorMessage}
              errorId={errorId}
              registerLabelTooltip={registerLabelTooltip}
              required={required}
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

  const { error } = props;
  const inputDescribedById = [
    error ? errorId : undefined,
    description ? descriptionId : undefined,
  ]
    .filter((value) => value !== undefined)
    .join(" ");

  return (
    <FormFieldLayout
      variant="field"
      label={label}
      controlId={controlId}
      description={description}
      descriptionId={descriptionId}
      errorMessage={error}
      errorId={errorId}
      announceError
      registerLabelTooltip={registerLabelTooltip}
      required={required}
    >
      {props.children({
        id: controlId,
        inputDescribedById: inputDescribedById || undefined,
      })}
    </FormFieldLayout>
  );
}
