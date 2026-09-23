"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { TYPESAFE_UPSTREAMS, type TypeSafeUpstream } from "@langfuse/shared";

type TypeSafeUpstreamSelection = TypeSafeUpstream["id"] | "custom";

const UPSTREAM_OPTIONS: { id: TypeSafeUpstreamSelection; label: string }[] = [
  ...TYPESAFE_UPSTREAMS,
  { id: "custom", label: "Custom" },
];

const UPSTREAM_DESCRIPTIONS: Record<TypeSafeUpstreamSelection, string> = {
  typesafe: "Direct connection, billed by TypeSafe.",
  "vercel-ai-gateway": "Routed and billed through your AI Gateway.",
  openrouter: "Routed and billed through OpenRouter.",
  custom: "Any other endpoint that implements TypeSafe's API.",
};

type TypeSafeUpstreamCardsProps = {
  value: TypeSafeUpstreamSelection;
  onValueChange: (value: TypeSafeUpstreamSelection) => void;
} & Pick<
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>,
  "aria-describedby" | "aria-label" | "aria-labelledby" | "disabled" | "id"
>;

/**
 * Picks which provider serves the Jev decision model. Each card is a radio
 * item, so arrow keys move the selection and the group reads as one field.
 */
export function TypeSafeUpstreamCards({
  value,
  onValueChange,
  ...rootProps
}: TypeSafeUpstreamCardsProps) {
  return (
    <RadioGroupPrimitive.Root
      {...rootProps}
      value={value}
      onValueChange={(next) => onValueChange(next as TypeSafeUpstreamSelection)}
      className="grid gap-2 sm:grid-cols-2"
    >
      {UPSTREAM_OPTIONS.map(({ id, label }) => {
        return (
          <RadioGroupPrimitive.Item
            key={id}
            value={id}
            aria-label={label}
            className="focus-visible:ring-ring data-[state=checked]:border-foreground data-[state=checked]:bg-background data-[state=unchecked]:bg-muted/30 data-[state=unchecked]:hover:bg-muted/50 relative flex min-w-0 flex-col items-start gap-1 rounded-md border p-3 pr-7 text-left transition-colors focus:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RadioGroupPrimitive.Indicator className="bg-foreground text-background absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full">
              <Check className="h-3 w-3" aria-hidden="true" />
            </RadioGroupPrimitive.Indicator>
            <span className="text-sm leading-none font-bold">{label}</span>
            <span className="text-muted-foreground text-xs">
              {UPSTREAM_DESCRIPTIONS[id]}
            </span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
