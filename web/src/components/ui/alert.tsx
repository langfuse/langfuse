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
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type AlertProps = Omit<
  Pick<React.ComponentProps<"div">, "children" | "className"> &
    Pick<VariantProps<typeof alertVariants>, "variant">,
  "className"
> & {
  className?:
    | "w-full max-w-3xl"
    | "mb-4"
    | "mt-4"
    | "mt-2 max-w-4xl"
    | "max-w-4xl"
    | "text-sm"
    | "max-w-sm"
    | "rounded-md p-2 [&>svg]:top-2 [&>svg]:left-2 [&>svg+div]:translate-y-0 [&>svg~*]:pl-5"
    | "pr-10";
};
type AlertTitleProps = Omit<
  Pick<React.ComponentProps<"h5">, "children" | "className">,
  "className"
> & {
  className?: "text-base font-bold" | "text-base" | "mb-1 text-sm" | "pr-4";
};

function Alert({ children, className, variant }: AlertProps) {
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)}>
      {children}
    </div>
  );
}

type AlertDescriptionProps = Omit<
  Pick<React.ComponentProps<"div">, "children" | "className">,
  "className"
> & {
  className?:
    | "flex items-center justify-between"
    | "mt-2 space-y-3"
    | "text-dark-yellow"
    | "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    | "text-xs"
    | "flex flex-col items-start gap-1";
};

function AlertTitle({ children, className }: AlertTitleProps) {
  return (
    <h5 className={cn("mb-1 leading-none font-bold tracking-tight", className)}>
      {children}
    </h5>
  );
}

function AlertDescription({ children, className }: AlertDescriptionProps) {
  return (
    <div className={cn("text-sm [&_p]:leading-relaxed", className)}>
      {children}
    </div>
  );
}

export { Alert, AlertTitle, AlertDescription };
