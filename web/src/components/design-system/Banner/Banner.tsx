import * as React from "react";
import { cva } from "class-variance-authority";
import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  SquareArrowOutUpRight,
  Info,
  TriangleAlert,
  X,
  type IconComponent,
} from "@langfuse/icons";

type BannerVariant = "neutral" | "info" | "success" | "warning" | "error";

const bannerVariants = cva(
  "text-foreground flex w-full gap-2 rounded-lg px-3 pt-2.5 pb-3 text-sm",
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

// One line tall: centers the icon on the first line of the text.
const iconVariants = cva("flex h-lh shrink-0 items-center", {
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

const actionsVariants = cva("flex flex-wrap gap-x-4 gap-y-1", {
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

// Bold text in the banner tone, no box.
const actionClassName =
  "focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm font-bold hover:underline focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50";

const icons: Record<BannerVariant, IconComponent> = {
  neutral: Info,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

/** External links get the external link icon from Banner, in place of `icon`. */
export type BannerAction = {
  text: string;
  icon?: IconComponent;
} & (
  | { onClick: () => void; disabled?: boolean; href?: never }
  | { href: string; onClick?: never; disabled?: never }
);

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

function BannerActionItem({ action }: { action: BannerAction }) {
  const Icon = action.icon;
  const icon = Icon ? (
    <Icon size="base" color="inherit" aria-hidden="true" />
  ) : null;

  if (action.href === undefined) {
    return (
      <button
        type="button"
        className={actionClassName}
        disabled={action.disabled}
        onClick={action.onClick}
      >
        {icon}
        {action.text}
      </button>
    );
  }

  const isExternal =
    action.href.startsWith("https://") || action.href.startsWith("http://");

  if (!isExternal) {
    return (
      <Link className={actionClassName} href={action.href}>
        {icon}
        {action.text}
      </Link>
    );
  }

  const hostname = new URL(action.href).hostname;
  const isLangfuseDomain =
    hostname === "langfuse.com" || hostname.endsWith(".langfuse.com");

  return (
    <a
      className={actionClassName}
      href={action.href}
      target="_blank"
      rel={isLangfuseDomain ? "noopener" : "noopener noreferrer"}
    >
      {action.text}
      <SquareArrowOutUpRight size="base" color="inherit" aria-hidden="true" />
    </a>
  );
}

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
      {/* Actions share the row with a one-line message and wrap underneath anything longer. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-2">
        <div
          className={
            title && children ? "min-w-0 basis-full" : "min-w-0 flex-auto"
          }
        >
          {title ? <h5 className="font-medium">{title}</h5> : null}
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <div className={actionsVariants({ variant })}>
            {actions.map((action) => (
              <BannerActionItem key={action.text} action={action} />
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
