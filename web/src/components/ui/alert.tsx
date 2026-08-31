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
      },
      size: {
        default: "",
        sm: "rounded-md p-2 [&>svg]:top-2 [&>svg]:left-2 [&>svg+div]:translate-y-0 [&>svg~*]:pl-5 [&>[data-slot=alert-title]]:text-sm [&>[data-slot=alert-description]]:text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type AlertProps = Omit<
  Pick<React.ComponentProps<"div">, "children" | "className"> &
    Pick<VariantProps<typeof alertVariants>, "size" | "variant">,
  "children" | "className"
> & {
  children: React.ReactNode;
  className?: "mb-4" | "mt-4" | "text-sm" | "pr-10";
};
type AlertTitleProps = Omit<
  Pick<React.ComponentProps<"h5">, "children" | "className">,
  "children" | "className"
> & {
  children: React.ReactNode;
  className?: "text-base" | "pr-4";
};

function Alert({ children, className, size, variant }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ size, variant }), className)}
    >
      {children}
    </div>
  );
}

type AlertDescriptionProps = Omit<
  Pick<React.ComponentProps<"div">, "children" | "className">,
  "children" | "className"
> & {
  children: React.ReactNode;
  className?:
    | "flex items-center justify-between"
    | "mt-2 space-y-3"
    | "text-dark-yellow"
    | "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    | "flex flex-col items-start gap-1";
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

function AlertDescription({ children, className }: AlertDescriptionProps) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm [&_p]:leading-relaxed", className)}
    >
      {children}
    </div>
  );
}

export { Alert, AlertTitle, AlertDescription };
