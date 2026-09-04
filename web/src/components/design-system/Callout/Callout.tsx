/* eslint-disable boundaries/dependencies */
"use client";

import { cva } from "class-variance-authority";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";

const calloutVariants = cva("relative w-full rounded-lg border p-3", {
  variants: {
    variant: {
      info: "border-light-blue bg-light-blue dark:border-light-blue dark:bg-light-blue",
      warning:
        "border-light-yellow bg-light-yellow dark:border-light-yellow dark:bg-light-yellow",
    },
  },
});

const contentVariants = cva("flex min-w-0 flex-1 flex-col gap-2", {
  variants: {
    align: {
      top: "sm:items-start",
      middle: "sm:items-center",
    },
  },
});

const descriptionVariants = cva(
  "ml-1 flex items-start gap-2 text-sm [&_p]:leading-relaxed",
  {
    variants: {
      align: {
        top: null,
        middle: "sm:items-center",
      },
    },
  },
);

export type CalloutProps = {
  variant: "info" | "warning";
  align: "top" | "middle";
  children: React.ReactElement;
  actions: React.ReactElement | null;
  onDismiss: () => void;
};

export function Callout({
  variant,
  align,
  children,
  actions,
  onDismiss,
}: CalloutProps) {
  return (
    <div role="alert" className={calloutVariants({ variant })}>
      <div className={descriptionVariants({ align })}>
        <div
          className={`${contentVariants({ align })} sm:flex-row sm:justify-between`}
        >
          <div className="text-foreground min-w-0 text-sm">{children}</div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2 self-end sm:ml-4 sm:self-auto">
              {actions}
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 p-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
