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
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type AlertTitleProps = Omit<
  Pick<React.ComponentProps<"h5">, "children" | "className">,
  "className"
> & {
  className?:
    | "text-base font-bold"
    | "text-base"
    | "text-yellow-800 dark:text-yellow-400"
    | "mb-1 text-sm"
    | "pr-4";
};

function Alert({
  children,
  className,
  variant,
}: Pick<React.ComponentProps<"div">, "children" | "className"> &
  Pick<VariantProps<typeof alertVariants>, "variant">) {
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)}>
      {children}
    </div>
  );
}

function AlertTitle({ children, className }: AlertTitleProps) {
  return (
    <h5 className={cn("mb-1 leading-none font-bold tracking-tight", className)}>
      {children}
    </h5>
  );
}

function AlertDescription({
  children,
  className,
}: Pick<React.ComponentProps<"div">, "children" | "className">) {
  return (
    <div className={cn("text-sm [&_p]:leading-relaxed", className)}>
      {children}
    </div>
  );
}

export { Alert, AlertTitle, AlertDescription };
