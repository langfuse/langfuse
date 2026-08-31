/* eslint-disable @repo/no-style-props */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const alertVariants = cva(
  "relative w-full rounded-lg border p-3 [&>svg~*]:pl-6 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
        info: "bg-light-blue border-dark-blue",
        warning:
          "border-dark-yellow bg-light-yellow text-dark-yellow [&>svg]:text-dark-yellow",
        "warning-light":
          "border-light-yellow bg-light-yellow text-dark-yellow [&>svg]:text-dark-yellow",
        "warning-subtle":
          "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-500 [&>[data-slot=alert-title]]:text-yellow-800 dark:[&>[data-slot=alert-title]]:text-yellow-400 [&>[data-slot=alert-description]]:text-yellow-700 dark:[&>[data-slot=alert-description]]:text-yellow-500",
      },
      size: {
        default: "",
        sm: "rounded-md p-2 [&>svg]:top-2 [&>svg]:left-2 [&>svg+div]:translate-y-0 [&>svg~*]:pl-5 [&>[data-slot=alert-title]]:text-sm [&>[data-slot=alert-description]]:text-xs",
      },
      dismissible: {
        true: "pr-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      dismissible: false,
    },
  },
);

type AlertProps = Pick<
  VariantProps<typeof alertVariants>,
  "dismissible" | "size" | "variant"
> & {
  children: React.ReactNode;
};
type AlertTitleProps = {
  children: React.ReactNode;
  className?: "text-base";
};

function Alert({ children, dismissible, size, variant }: AlertProps) {
  return (
    <div role="alert" className={alertVariants({ dismissible, size, variant })}>
      {children}
    </div>
  );
}

type AlertDescriptionProps = {
  children: React.ReactNode;
};

function AlertTitle({ children, className }: AlertTitleProps) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("mb-1 leading-none font-bold tracking-tight", className)}
    >
      {children}
    </h5>
  );
}

function AlertDescription({ children }: AlertDescriptionProps) {
  return (
    <div
      data-slot="alert-description"
      className="text-sm [&_p]:leading-relaxed"
    >
      {children}
    </div>
  );
}

export { Alert, AlertTitle, AlertDescription };
