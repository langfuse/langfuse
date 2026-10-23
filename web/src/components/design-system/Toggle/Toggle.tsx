"use client";

import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva } from "class-variance-authority";

const toggleVariants = cva(
  "ring-offset-background focus-visible:ring-ring inline-flex items-center justify-center text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
  {
    variants: {
      variant: {
        default:
          "text-muted-foreground/50 hover:bg-background hover:text-primary-accent data-[state=on]:text-primary-accent h-8 rounded-md bg-transparent p-1 font-bold transition-colors",
        /** A pressed pill in a row of filters or picks. */
        chip: "bg-background text-foreground hover:border-primary-accent/55 data-[state=on]:border-primary-accent data-[state=on]:bg-primary-accent/10 h-7 shrink-0 gap-1.5 rounded-full border px-2.5 font-normal whitespace-nowrap transition-[color,background-color,border-color,scale] duration-150 ease-out motion-safe:active:scale-[0.97]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type ToggleProps = Pick<
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>,
  | "children"
  | "onClick"
  | "onFocus"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onPointerEnter"
  | "pressed"
> &
  (
    | { variant?: "default"; count?: never }
    | {
        variant: "chip";
        /** Shown muted after the label, e.g. how many items the filter keeps; `null` for none. */
        count: number | null;
      }
  );

export function Toggle({ variant, count, children, ...props }: ToggleProps) {
  return (
    <TogglePrimitive.Root className={toggleVariants({ variant })} {...props}>
      {children}
      {count === undefined || count === null ? null : (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      )}
    </TogglePrimitive.Root>
  );
}
