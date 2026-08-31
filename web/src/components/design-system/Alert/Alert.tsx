/* eslint-disable @repo/no-style-props */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

type AlertContent = Exclude<React.ReactNode, null | undefined | boolean>;

const alertVariants = cva(
  "relative w-full rounded-lg border p-3 [&>[data-slot=alert-icon]]:text-foreground [&>[data-slot=alert-title]]:mb-1",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>[data-slot=alert-icon]]:text-destructive",
        info: "bg-light-blue border-dark-blue",
        warning:
          "border-dark-yellow bg-light-yellow text-dark-yellow [&>[data-slot=alert-icon]]:text-dark-yellow",
        "warning-light":
          "border-light-yellow bg-light-yellow text-dark-yellow [&>[data-slot=alert-icon]]:text-dark-yellow",
        "warning-subtle":
          "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 [&>[data-slot=alert-icon]]:text-yellow-600 dark:[&>[data-slot=alert-icon]]:text-yellow-500 [&>[data-slot=alert-title]]:text-yellow-800 dark:[&>[data-slot=alert-title]]:text-yellow-400 [&>[data-slot=alert-description]]:text-yellow-700 dark:[&>[data-slot=alert-description]]:text-yellow-500",
      },
      size: {
        default: "",
        sm: "rounded-md p-2 [&>[data-slot=alert-icon]]:top-2 [&>[data-slot=alert-icon]]:left-2 [&>[data-slot=alert-title]]:text-sm [&>[data-slot=alert-description]]:text-xs",
      },
      actionPosition: {
        "top-right": "pr-10",
      },
      hasIcon: {
        true: "[&>[data-slot=alert-title]]:pl-6 [&>[data-slot=alert-description]]:pl-6 [&>[data-slot=alert-icon]+[data-slot=alert-description]]:translate-y-[-3px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type AlertProps = Pick<
  VariantProps<typeof alertVariants>,
  "actionPosition" | "size" | "variant"
> & {
  children: AlertContent;
  icon?: LucideIcon;
};
type AlertTitleProps = {
  children: React.ReactNode;
  className?: "text-base";
};

function AlertRoot({
  actionPosition,
  children,
  icon: Icon,
  size,
  variant,
}: AlertProps) {
  return (
    <div
      role="alert"
      className={alertVariants({
        actionPosition,
        hasIcon: Boolean(Icon),
        size,
        variant,
      })}
    >
      {Icon ? (
        <Icon
          data-slot="alert-icon"
          className="absolute top-3 left-3 size-4"
          aria-hidden="true"
        />
      ) : null}
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
      className={cn("leading-none font-bold tracking-tight", className)}
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

const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
});

export { Alert };
