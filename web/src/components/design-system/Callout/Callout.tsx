"use client";

import { cva } from "class-variance-authority";
import { type IconComponent, X } from "@langfuse/icons";
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

// One line tall, 1px low: centers the icon on the first line's lowercase letters.
const iconClasses = "flex h-lh shrink-0 translate-y-px items-center";

const actionsVariants = cva(
  "flex shrink-0 items-center gap-4 self-end sm:ml-6 sm:self-auto",
  {
    variants: {
      variant: {
        info: "text-dark-blue",
        warning: "text-dark-yellow",
      },
    },
  },
);

// Bold text in the callout tone, no box.
const actionClasses =
  "inline-flex items-center gap-1.5 rounded-sm text-sm font-bold hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50";

export type CalloutAction =
  | {
      type: "button";
      label: string;
      icon?: IconComponent;
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
  /** Sits on the first line of the text. */
  icon?: IconComponent;
  children: React.ReactElement;
  actions: ReadonlyArray<CalloutAction>;
  onDismiss: () => void;
};

export function Callout({
  variant,
  align,
  icon: LeadingIcon,
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
          <div className="text-foreground flex min-w-0 gap-2 text-sm">
            {LeadingIcon ? (
              <span className={iconClasses}>
                <LeadingIcon size="base" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0">{children}</div>
          </div>
          {actions.length > 0 ? (
            <div className={actionsVariants({ variant })}>
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
                      {Icon ? <Icon size="base" aria-hidden /> : null}
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
          className="focus-visible:ring-ring text-icon-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-transparent transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden dark:hover:bg-white/10"
          onClick={onDismiss}
          type="button"
        >
          <X size="base" aria-hidden />
        </button>
      </div>
    </div>
  );
}
