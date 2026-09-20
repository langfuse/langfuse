/* eslint-disable @repo/no-style-props */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border border-transparent font-bold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        "outline-solid": "border-input bg-background text-foreground",
        tertiary: "bg-tertiary text-tertiary-foreground",
        success: "bg-light-green text-dark-green",
        error: "bg-light-red text-dark-red",
        warning: "bg-light-yellow text-dark-yellow",
        blue: "bg-light-blue text-dark-blue",
        violet: "bg-light-violet text-dark-violet",
        teal: "bg-light-teal text-dark-teal",
        emerald:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        purple:
          "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
        pink: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
        orange:
          "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
        amber:
          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
        green:
          "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-1 py-0 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge };
