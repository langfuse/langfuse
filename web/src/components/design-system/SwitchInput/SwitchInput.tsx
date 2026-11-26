"use client";

import { type ComponentPropsWithoutRef, type Ref } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Switch } from "@/src/components/design-system/Switch/Switch";

const switchInputVariants = cva("flex items-center justify-between gap-4", {
  variants: {
    variant: {
      default:
        "border-input bg-background min-h-8 cursor-pointer rounded-md border px-3 py-[5px]",
      plain: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

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
> &
  VariantProps<typeof switchInputVariants> & {
    description: string;
    id: string;
    title?: string;
    ref?: Ref<HTMLButtonElement>;
  };

export function SwitchInput({
  "aria-describedby": ariaDescribedBy,
  description,
  id,
  title,
  variant = "default",
  ref,
  ...props
}: SwitchInputProps) {
  const descriptionId = `${id}-description`;
  const describedBy = [descriptionId, ariaDescribedBy]
    .filter((value) => value !== undefined)
    .join(" ");

  if (title !== undefined) {
    const labelId = `${id}-label`;
    return (
      <div className={switchInputVariants({ variant })}>
        <div className="flex min-w-0 flex-col gap-1">
          <h4 id={labelId} className="font-bold">
            <label
              htmlFor={id}
              className={
                props.disabled ? "cursor-not-allowed" : "cursor-pointer"
              }
            >
              {title}
            </label>
          </h4>
          <p id={descriptionId} className="text-muted-foreground text-sm">
            {description}
          </p>
        </div>
        <Switch
          {...props}
          id={id}
          ref={ref}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
        />
      </div>
    );
  }

  return (
    <label htmlFor={id} className={switchInputVariants({ variant })}>
      <span
        id={descriptionId}
        className="text-muted-foreground min-w-0 text-sm leading-5"
      >
        {description}
      </span>
      <Switch {...props} id={id} ref={ref} aria-describedby={describedBy} />
    </label>
  );
}
