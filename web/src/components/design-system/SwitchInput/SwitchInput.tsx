"use client";

import { type ComponentPropsWithoutRef, type Ref } from "react";

import { Switch } from "@/src/components/design-system/Switch/Switch";

type SwitchInputProps = Pick<
  ComponentPropsWithoutRef<typeof Switch>,
  | "aria-describedby"
  | "aria-invalid"
  | "aria-label"
  | "checked"
  | "disabled"
  | "name"
  | "onBlur"
  | "onCheckedChange"
> & {
  description: string;
  id: string;
  ref?: Ref<HTMLButtonElement>;
};

export function SwitchInput({
  "aria-describedby": ariaDescribedBy,
  description,
  id,
  ref,
  ...props
}: SwitchInputProps) {
  const descriptionId = `${id}-description`;

  return (
    <label
      htmlFor={id}
      className="border-input bg-background flex min-h-8 cursor-pointer items-center justify-between gap-4 rounded-md border px-3 py-2"
    >
      <p id={descriptionId} className="text-muted-foreground min-w-0 text-sm">
        {description}
      </p>
      <Switch
        {...props}
        id={id}
        ref={ref}
        aria-describedby={[descriptionId, ariaDescribedBy]
          .filter((value) => value !== undefined)
          .join(" ")}
      />
    </label>
  );
}
