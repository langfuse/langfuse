"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type SelectionCardRadioGroupOption<TValue extends string> = {
  value: TValue;
  icon: LucideIcon;
  title: string;
  summary: string;
  example?: string;
  headerAdornment?: ReactNode;
};

export type SelectionCardRadioGroupProps<TValue extends string> = {
  ariaLabel: string;
  columns: 2 | 3;
  options: readonly SelectionCardRadioGroupOption<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  disabled?: boolean;
};

export function SelectionCardRadioGroup<TValue extends string>({
  ariaLabel,
  columns,
  options,
  value,
  onValueChange,
  disabled = false,
}: SelectionCardRadioGroupProps<TValue>) {
  return (
    <div className="@container">
      <RadioGroupPrimitive.Root
        aria-label={ariaLabel}
        className={
          columns === 2
            ? "grid gap-2 @lg:grid-cols-2"
            : "grid gap-2 @lg:grid-cols-3"
        }
        disabled={disabled}
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      >
        {options.map((option) => {
          const Icon = option.icon;

          return (
            <RadioGroupPrimitive.Item
              key={option.value}
              value={option.value}
              className="border-border hover:bg-muted/50 focus-visible:ring-ring data-[state=checked]:border-primary-accent data-[state=checked]:bg-primary-accent/5 data-[state=checked]:ring-primary-accent flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:ring-1"
            >
              <span className="flex items-center gap-1.5 font-bold">
                <Icon className="icon-base shrink-0" />
                <span>{option.title}</span>
                {option.headerAdornment}
              </span>
              <span className="text-muted-foreground">{option.summary}</span>
              {option.example ? (
                <span className="text-muted-foreground text-xs italic">
                  e.g. “{option.example}”
                </span>
              ) : null}
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
