"use client";

import { type ComponentProps } from "react";
import { Input } from "../Input/Input";

/** A selectable, read-only value with a clipboard action. */
export function CopyInput({
  value,
  copyLabel,
  onCopyResult,
  ...inputProps
}: Pick<
  ComponentProps<typeof Input>,
  "id" | "aria-describedby" | "aria-label" | "aria-labelledby" | "noCapture"
> & {
  value: string;
  copyLabel: string;
  onCopyResult?: NonNullable<
    ComponentProps<typeof Input>["copyAction"]
  >["onCopyResult"];
}) {
  return (
    <Input
      {...inputProps}
      value={value}
      readOnly
      copyAction={{ label: copyLabel, onCopyResult }}
    />
  );
}
