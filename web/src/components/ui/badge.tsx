/* eslint-disable @repo/no-style-props */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const badgeVariants = cva(
  "inline-flex h-5.5 items-center gap-1.5 rounded-sm border pr-1.5 pb-px pl-2 text-xs leading-none font-normal transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border-border text-foreground-secondary",
        "outline-solid": "border-input bg-background text-foreground",
        tertiary: "border-transparent bg-tertiary/60 text-foreground-secondary",
        success: "border-transparent bg-light-green text-dark-green",
        error: "border-transparent bg-light-red text-dark-red",
        warning: "border-transparent bg-light-yellow text-dark-yellow",
        blue: "border-transparent bg-light-blue text-dark-blue",
        violet: "border-transparent bg-light-violet text-dark-violet",
        teal: "border-transparent bg-light-teal text-dark-teal",
        emerald:
          "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        purple:
          "border-transparent bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
        pink: "border-transparent bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
        orange:
          "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
        amber:
          "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
        green:
          "border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
        ghost: "border-transparent bg-transparent text-muted-foreground",
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
