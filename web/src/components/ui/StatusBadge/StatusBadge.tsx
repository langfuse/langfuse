import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-2 rounded-md break-all sm:break-normal",
  {
    variants: {
      size: {
        default: "px-2 py-1 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const statusCategories = {
  active: ["production", "live", "active", "public"],
  pending: ["pending", "waiting", "queued", "running"],
  delayed: ["delayed"],
  inactive: ["disabled", "inactive"],
  paused: ["paused"],
  completed: ["completed", "done", "finished"],
  error: ["error", "failed"],
  partial: ["partial"],
} as const;

export type Status =
  (typeof statusCategories)[keyof typeof statusCategories][number];

type StatusCategory = keyof typeof statusCategories | "unknown";

// Exhaustive style lookup: every CSS property is supplied by exactly one
// branch per category, so no class merging is needed to resolve conflicts.
const categoryStyles: Record<
  StatusCategory,
  {
    background: string;
    text: string;
    dotOuter: string;
    dotInner: string;
    hideDot?: boolean;
  }
> = {
  active: {
    background: "bg-success-tint",
    text: "text-success",
    dotOuter: "animate-ping bg-success",
    dotInner: "bg-success",
  },
  pending: {
    background: "bg-warning-tint",
    text: "text-warning",
    dotOuter: "animate-ping bg-warning",
    dotInner: "bg-warning",
  },
  delayed: {
    background: "bg-info-tint",
    text: "text-info",
    dotOuter: "animate-ping bg-info",
    dotInner: "bg-info",
  },
  inactive: {
    background: "bg-muted-gray",
    text: "text-primary",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
  },
  paused: {
    background: "bg-warning-tint",
    text: "text-warning",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-warning",
  },
  completed: {
    background: "bg-success-tint",
    text: "text-success",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
    hideDot: true,
  },
  error: {
    background: "bg-danger-tint",
    text: "text-danger",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
    hideDot: true,
  },
  partial: {
    background: "bg-warning-tint",
    text: "text-warning",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
    hideDot: true,
  },
  unknown: {
    background: "bg-muted-gray",
    text: "text-primary",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
  },
};

// preserveCase only affects rendered text, so it can only be set when the
// text is shown.
type StatusBadgeTextProps =
  | { showText?: true; preserveCase?: boolean }
  | { showText: false; preserveCase?: never };

export const StatusBadge = ({
  type,
  variant = "default",
  size = "default",
  isLive = true,
  showText = true,
  preserveCase = false,
  children,
}: {
  type: Status | (string & {});
  variant?: "default" | "transparent";
  isLive?: boolean;
  children?: ReactNode;
} & VariantProps<typeof statusBadgeVariants> &
  StatusBadgeTextProps) => {
  const normalizedType = type?.toLowerCase() ?? "";

  const category: StatusCategory =
    (Object.keys(statusCategories) as (keyof typeof statusCategories)[]).find(
      (key) =>
        (statusCategories[key] as readonly string[]).includes(normalizedType),
    ) ?? "unknown";

  const styles = categoryStyles[category];
  const background =
    variant === "transparent" ? "bg-transparent" : styles.background;
  const showDot = isLive && !styles.hideDot;

  return (
    <div className={cn(statusBadgeVariants({ size }), background, styles.text)}>
      {showDot && (
        <span className="relative inline-flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              styles.dotOuter,
            )}
          ></span>
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              styles.dotInner,
            )}
          ></span>
        </span>
      )}
      {showText && type && (
        <span>
          {preserveCase ? type : type[0].toUpperCase() + type.slice(1)}
        </span>
      )}
      {children}
    </div>
  );
};
