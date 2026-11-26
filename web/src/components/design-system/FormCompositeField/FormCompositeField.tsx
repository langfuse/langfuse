"use client";

import { useId, type ComponentProps } from "react";

import { FormFieldLayout } from "../internal/FormFieldLayout/FormFieldLayout";

/**
 * Presents multiple controls as one compact field, without binding a form value.
 * Use sublabel for an introduction above the controls and description for help below.
 * Use Form.Field for a single labeled control.
 */
export function FormCompositeField({
  label,
  sublabel,
  description,
  registerLabelTooltip,
  required,
  children,
}: Pick<
  Extract<ComponentProps<typeof FormFieldLayout>, { variant: "composite" }>,
  | "label"
  | "sublabel"
  | "description"
  | "registerLabelTooltip"
  | "required"
  | "children"
>) {
  const id = useId();

  return (
    <FormFieldLayout
      variant="composite"
      label={label}
      labelId={`${id}-label`}
      sublabel={sublabel}
      description={description?.length ? description : undefined}
      descriptionId={`${id}-description`}
      registerLabelTooltip={registerLabelTooltip}
      required={required}
    >
      {children}
    </FormFieldLayout>
  );
}
