"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactElement, SVGProps } from "react";
import {
  TYPESAFE_UPSTREAM_DEFINITIONS,
  TYPESAFE_UPSTREAMS,
  type TypeSafeUpstream,
} from "@langfuse/shared";

type UpstreamCardCopy = {
  description: string;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
};

const UPSTREAM_CARD_COPY: Record<TypeSafeUpstream, UpstreamCardCopy> = {
  typesafe: {
    description: "Direct connection, billed by TypeSafe.",
    Icon: TypeSafeIcon,
  },
  "vercel-ai-gateway": {
    description: "Routed and billed through your AI Gateway.",
    Icon: VercelIcon,
  },
  openrouter: {
    description: "Routed and billed through OpenRouter.",
    Icon: OpenRouterIcon,
  },
};

type TypeSafeUpstreamCardsProps = {
  value: TypeSafeUpstream;
  onValueChange: (value: TypeSafeUpstream) => void;
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
      onValueChange={(next) => onValueChange(next as TypeSafeUpstream)}
      className="grid gap-2 sm:grid-cols-3"
    >
      {TYPESAFE_UPSTREAMS.map((upstream) => {
        const { label } = TYPESAFE_UPSTREAM_DEFINITIONS[upstream];
        const { description, Icon } = UPSTREAM_CARD_COPY[upstream];

        return (
          <RadioGroupPrimitive.Item
            key={upstream}
            value={upstream}
            aria-label={label}
            className="focus-visible:ring-ring data-[state=checked]:border-foreground data-[state=checked]:bg-background data-[state=unchecked]:bg-muted/30 data-[state=unchecked]:hover:bg-muted/50 relative flex min-w-0 flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors focus:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RadioGroupPrimitive.Indicator className="bg-foreground text-background absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full">
              <Check className="h-3 w-3" aria-hidden="true" />
            </RadioGroupPrimitive.Indicator>
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm leading-none font-bold">{label}</span>
              <span className="text-muted-foreground text-xs">
                {description}
              </span>
            </span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}

// Monochrome marks rendered in `currentColor` so they follow the theme.

function TypeSafeIcon(props: SVGProps<SVGSVGElement>) {
  // Approximation of the TypeSafe mark: two interlocking isometric prisms.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 2.5 3.5 5.7v6.4L9 15.3l5.5-3.2V5.7L9 2.5Z" />
      <path d="M15 8.7 9.5 11.9v6.4L15 21.5l5.5-3.2v-6.4L15 8.7Z" />
      <path d="M3.5 5.7 9 8.9l5.5-3.2M9 8.9v6.4M9.5 11.9 15 15.1l5.5-3.2M15 15.1v6.4" />
    </svg>
  );
}

function VercelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 76 65" fill="currentColor" {...props}>
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

function OpenRouterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" {...props}>
      <path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z" />
    </svg>
  );
}
