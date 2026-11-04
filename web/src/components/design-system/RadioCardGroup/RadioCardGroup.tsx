"use client";

import { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { RadioGroup } from "../RadioGroup/RadioGroup";

export function RadioCardGroup<TValue extends string>({
  options,
  value,
  onValueChange,
  ...props
}: {
  id?: string;
  "aria-label": string;
  "aria-describedby"?: string;
  options: readonly { value: TValue; label: string }[];
  value: TValue;
  onValueChange: (value: TValue) => void;
}) {
  const groupId = useId();

  return (
    <RadioGroupPrimitive.Root
      {...props}
      className="flex gap-2"
      orientation="horizontal"
      value={value}
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
