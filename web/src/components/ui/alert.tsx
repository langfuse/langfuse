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

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

function AlertTitle({
  children,
  className,
}: Pick<React.ComponentProps<"h5">, "children" | "className">) {
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
