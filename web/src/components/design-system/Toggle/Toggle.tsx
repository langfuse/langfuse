"use client";

import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md font-bold ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-foreground hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
        ghost:
          "bg-transparent text-muted-foreground/50 hover:bg-background hover:text-primary-accent data-[state=on]:bg-transparent data-[state=on]:text-primary-accent",
      },
      size: {
        default: "h-8 px-3 text-sm",
        xs: "h-6 px-1.5 text-sm",
        sm: "h-9 px-2.5 text-sm",
        lg: "h-11 px-5 text-sm",
        compact: "h-8 p-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ToggleProps = Pick<
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>,
  | "aria-label"
  | "children"
  | "disabled"
  | "onClick"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onPressedChange"
  | "pressed"
> &
  VariantProps<typeof toggleVariants> & {
    ref?: React.Ref<React.ComponentRef<typeof TogglePrimitive.Root>>;
  };

export function Toggle({ ref, variant, size, ...props }: ToggleProps) {
  return (
    <TogglePrimitive.Root
      ref={ref}
      className={cn(toggleVariants({ variant, size }))}
      {...props}
    />
  );
}
