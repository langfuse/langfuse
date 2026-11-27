"use client";

import { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { RadioGroup } from "../RadioGroup/RadioGroup";

export function RadioCardGroup<TValue extends string>({
  options,
  value,
  onValueChange,
  orientation = "horizontal",
  ...props
}: {
  id?: string;
  "aria-label": string;
  "aria-describedby"?: string;
  options: readonly { value: TValue; label: string }[];
  /** `null` while nothing is picked yet. */
  value: TValue | null;
  onValueChange: (value: TValue) => void;
  /** "vertical" stacks the cards, for more options than fit in a row. */
  orientation?: "horizontal" | "vertical";
}) {
  const groupId = useId();

  return (
    <RadioGroupPrimitive.Root
      {...props}
      className={
        orientation === "vertical" ? "flex flex-col gap-2" : "flex gap-2"
      }
      orientation={orientation}
      value={value ?? ""}
      onValueChange={(nextValue) => {
        const option = options.find((option) => option.value === nextValue);
        if (option) onValueChange(option.value);
      }}
    >
      {options.map((option, index) => (
        <label
          key={option.value}
          htmlFor={`${groupId}-${index}`}
          className="has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 hover:bg-accent flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
        >
          <RadioGroup.Item id={`${groupId}-${index}`} value={option.value} />
          {option.label}
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
