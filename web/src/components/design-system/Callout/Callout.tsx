"use client";

import { cva } from "class-variance-authority";
import { type LucideIcon, X } from "lucide-react";
import Link from "next/link";

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

const actionClasses =
  "inline-flex h-6 items-center justify-center gap-1.5 rounded-md border border-current bg-transparent px-2.5 text-sm transition-colors hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10";

export type CalloutAction =
  | {
      type: "button";
      label: string;
      icon?: LucideIcon;
      onClick: () => void;
    }
  | {
      type: "link";
      label: string;
      href: string;
      onClick?: () => void;
    };

export type CalloutProps = {
  variant: "info" | "warning";
  align: "top" | "middle";
  children: React.ReactElement;
  actions: ReadonlyArray<CalloutAction>;
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
          {actions.length > 0 ? (
            <div className="flex shrink-0 items-center gap-2 self-end sm:ml-4 sm:self-auto">
              {actions.map((action) => {
                if (action.type === "button") {
                  const Icon = action.icon;
                  return (
                    <button
                      className={actionClasses}
                      key={action.label}
                      onClick={action.onClick}
                      type="button"
                    >
                      {Icon ? <Icon className="size-4" aria-hidden /> : null}
                      {action.label}
                    </button>
                  );
                }

                const isExternal =
                  action.href.startsWith("https://") ||
                  action.href.startsWith("http://");

                if (isExternal) {
                  return (
                    <a
                      className={actionClasses}
                      href={action.href}
                      key={action.label}
                      onClick={action.onClick}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {action.label}
                    </a>
                  );
                }

                return (
                  <Link
                    className={actionClasses}
                    href={action.href}
                    key={action.label}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
        <button
          aria-label="Dismiss"
          className="focus-visible:ring-ring inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-transparent transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden dark:hover:bg-white/10"
          onClick={onDismiss}
          type="button"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
