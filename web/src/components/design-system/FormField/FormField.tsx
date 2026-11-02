"use client";

import { Info, SquareArrowOutUpRight } from "@langfuse/icons";
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
import { assertUnreachable } from "@/src/utils/types";

type FormFieldDescription =
  | string
  | readonly (
      | { type: "text"; text: string }
      | { type: "code"; text: string }
      | { type: "link"; text: string; href: string }
      | { type: "strong"; text: string }
    )[];

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
  description?: FormFieldDescription;
  label: string;
  name: TName;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
  required?: boolean;
};

type StandaloneFormFieldProps = {
  control?: never;
  name?: never;
  children: (field: {
    id: string;
    inputDescribedById: string | undefined;
  }) => ReactElement;
  description?: FormFieldDescription;
  label: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
  required?: boolean;
};

function FormFieldDescription({
  description,
  id,
}: {
  description: FormFieldDescription;
  id: string;
}) {
  return (
    <p id={id} className="text-muted-foreground text-sm">
      {typeof description === "string"
        ? description
        : description.map((element, index) => {
            if (element.type === "text") {
              return element.text;
            }
            if (element.type === "code") {
              return (
                <code
                  key={index}
                  className="bg-muted rounded-md px-1 py-px font-mono text-xs"
                >
                  {element.text}
                </code>
              );
            }
            if (element.type === "link") {
              return (
                <a
                  key={index}
                  className="text-link hover:text-link-hover underline underline-offset-2"
                  href={element.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {element.text}
                  <SquareArrowOutUpRight
                    aria-hidden
                    size="sm"
                    color="muted"
                    __rawClassName="ml-0.75 inline-block align-[-1px]"
                  />
                </a>
              );
            }
            if (element.type === "strong") {
              return (
                <strong key={index} className="text-foreground font-bold">
                  {element.text}
                </strong>
              );
            }
            return assertUnreachable(element);
          })}
    </p>
  );
}

function FormFieldLayout({
  label,
  controlId,
  description,
  descriptionId,
  errorMessage,
  errorId,
  registerLabelTooltip,
  required,
  children,
}: {
  label: string;
  controlId: string;
  description?: FormFieldDescription;
  descriptionId: string;
  errorMessage?: string;
  errorId: string;
  registerLabelTooltip?: TooltipTriggerPropsGetter;
  required?: boolean;
  children: ReactElement;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={controlId} className="text-sm leading-none font-bold">
          {label}
          {required ? (
            <span aria-hidden className="text-destructive ml-1">
              *
            </span>
          ) : null}
        </label>
        {registerLabelTooltip ? (
          <button
            type="button"
            {...registerLabelTooltip()}
            aria-label={`About ${label}`}
          >
            <Info aria-hidden size="base" color="muted" />
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
        <FormFieldDescription id={descriptionId} description={description} />
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

  return (
    <FormFieldLayout
      label={label}
      controlId={controlId}
      description={description}
      descriptionId={descriptionId}
      errorId={errorId}
      registerLabelTooltip={registerLabelTooltip}
      required={required}
    >
      {props.children({
        id: controlId,
        inputDescribedById: description ? descriptionId : undefined,
      })}
    </FormFieldLayout>
  );
}
