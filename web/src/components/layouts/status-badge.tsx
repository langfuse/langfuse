import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";

const statusCategories = {
  active: ["production", "live", "active", "public"],
  pending: ["pending", "waiting", "queued", "running"],
  delayed: ["delayed"],
  inactive: ["disabled", "inactive"],
  paused: ["paused"],
  completed: ["completed", "done", "finished"],
  error: ["error", "failed"],
  partial: ["partial"],
};

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
    background: "bg-light-green",
    text: "text-dark-green",
    dotOuter: "animate-ping bg-dark-green",
    dotInner: "bg-dark-green",
  },
  pending: {
    background: "bg-light-yellow",
    text: "text-dark-yellow",
    dotOuter: "animate-ping bg-dark-yellow",
    dotInner: "bg-dark-yellow",
  },
  delayed: {
    background: "bg-light-blue",
    text: "text-dark-blue",
    dotOuter: "animate-ping bg-dark-blue",
    dotInner: "bg-dark-blue",
  },
  inactive: {
    background: "bg-muted-gray",
    text: "text-primary",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
  },
  paused: {
    background: "bg-light-yellow",
    text: "text-dark-yellow",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-dark-yellow",
  },
  completed: {
    background: "bg-light-green",
    text: "text-dark-green",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
    hideDot: true,
  },
  error: {
    background: "bg-light-red",
    text: "text-dark-red",
    dotOuter: "bg-muted-foreground",
    dotInner: "bg-muted-foreground",
    hideDot: true,
  },
  partial: {
    background: "bg-light-yellow",
    text: "text-dark-yellow",
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

export const StatusBadge = ({
  type,
  variant = "default",
  isLive = true,
  className,
  showText = true,
  preserveCase = false,
  children,
}: {
  type: Status | (string & {});
  variant?: "default" | "transparent";
  isLive?: boolean;
  className?:
    | "w-fit self-start"
    | "pl-3"
    | "ml-2"
    | "mb-3 px-3 py-1 text-sm"
    | "";
  showText?: boolean;
  preserveCase?: boolean;
  children?: ReactNode;
}) => {
  const normalizedType = type?.toLowerCase() ?? "";

  const category: StatusCategory =
    (Object.keys(statusCategories) as (keyof typeof statusCategories)[]).find(
      (key) => statusCategories[key].includes(normalizedType),
    ) ?? "unknown";

  const styles = categoryStyles[category];
  const background =
    variant === "transparent" ? "bg-transparent" : styles.background;
  const showDot = isLive && !styles.hideDot;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs break-all sm:break-normal",
        background,
        styles.text,
        className,
      )}
    >
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
