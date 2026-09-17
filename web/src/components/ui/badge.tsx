/* eslint-disable @repo/no-style-props */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex items-center rounded-xs border px-1.5 py-0 text-xs leading-tight font-normal transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border-border-contrast text-muted-foreground",
        "outline-solid": "border-input bg-background text-foreground",
        tertiary: "border-transparent bg-tertiary text-foreground-secondary",
        success: "border-transparent bg-light-green text-dark-green",
        error: "border-transparent bg-light-red text-dark-red",
        warning: "border-transparent bg-light-yellow text-dark-yellow",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
