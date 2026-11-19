import * as React from "react";
import { cva } from "class-variance-authority";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
  type IconComponent,
} from "@langfuse/icons";

import { Button } from "../Button/Button";

type BannerVariant = "neutral" | "info" | "success" | "warning" | "error";

const bannerVariants = cva(
  "text-foreground flex w-full gap-2 rounded-lg p-3 text-sm",
  {
    variants: {
      variant: {
        neutral: "bg-muted",
        info: "bg-light-blue",
        success: "bg-light-green",
        warning: "bg-light-yellow",
        error: "bg-light-red",
      },
    },
  },
);

// One line tall, 1px low: centers the icon on the first line's lowercase letters.
const iconVariants = cva("flex h-lh shrink-0 translate-y-px items-center", {
  variants: {
    variant: {
      neutral: "text-icon-foreground",
      info: "text-dark-blue",
      success: "text-dark-green",
      warning: "text-dark-yellow",
      error: "text-dark-red",
    },
  },
});

const actionsVariants = cva("mt-2 flex flex-wrap gap-x-4 gap-y-1", {
  variants: {
    variant: {
      neutral: "text-foreground",
      info: "text-dark-blue",
      success: "text-dark-green",
      warning: "text-dark-yellow",
      error: "text-dark-red",
    },
  },
});

const icons: Record<BannerVariant, IconComponent> = {
  neutral: Info,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type BannerAction = DistributiveOmit<
  React.ComponentProps<typeof Button>,
  "size" | "variant"
>;

type BannerProps = {
  variant?: BannerVariant;
  title?: string;
  children?: React.ReactNode;
  actions?: ReadonlyArray<BannerAction>;
  /** Renders a dismiss button. */
  onDismiss?: () => void;
  /** Replaces the variant's icon. */
  icon?: IconComponent;
};

export function Banner({
  variant = "neutral",
  title,
  children,
  actions,
  onDismiss,
  icon,
}: BannerProps) {
  const Icon = icon ?? icons[variant];

  return (
    <div
      role="alert"
      data-variant={variant}
      className={bannerVariants({ variant })}
    >
      <span className={iconVariants({ variant })}>
        <Icon size="base" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <h5 className="font-medium">{title}</h5> : null}
        {children}
        {actions && actions.length > 0 ? (
          <div className={actionsVariants({ variant })}>
            {actions.map((action) => (
              <Button key={action.text} {...action} variant="link" />
            ))}
          </div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          className="focus-visible:ring-ring hover:bg-foreground/10 text-icon-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-transparent transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
          onClick={onDismiss}
        >
          <X size="base" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
