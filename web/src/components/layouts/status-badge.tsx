import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";

const statusCategories = {
  active: ["production", "live", "active", "public"],
  pending: ["pending", "waiting", "queued"],
  inactive: ["disabled", "inactive"],
  completed: ["completed", "done", "finished"],
  error: ["error", "failed"],
};

export type Status =
  (typeof statusCategories)[keyof typeof statusCategories][number];

export const StatusBadge = ({
  type,
  isLive = true,
  className,
  showText = true,
  children,
}: {
  type: Status | (string & {});
  isLive?: boolean;
  className?: string;
  showText?: boolean;
  children?: ReactNode;
}) => {
  let badgeColor = "bg-muted-gray text-primary";
  let dotColor = "bg-muted-foreground";
  let dotPingColor = "bg-muted-foreground";
  let showDot = isLive;

  if (statusCategories.active.includes(type.toLowerCase())) {
    badgeColor = "bg-light-green text-dark-green";
    dotColor = "animate-ping bg-dark-green";
    dotPingColor = "bg-dark-green";
  } else if (statusCategories.pending.includes(type.toLowerCase())) {
    badgeColor = "bg-light-yellow text-dark-yellow";
    dotColor = "animate-ping bg-dark-yellow";
    dotPingColor = "bg-dark-yellow";
  } else if (statusCategories.error.includes(type.toLowerCase())) {
    badgeColor = "bg-light-red text-dark-red";
    showDot = false;
  } else if (statusCategories.completed.includes(type.toLowerCase())) {
    badgeColor = "bg-light-green text-dark-green";
    showDot = false;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs",
        badgeColor,
        className,
      )}
    >
      {showDot && (
        <span className="relative inline-flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              dotColor,
            )}
          ></span>
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              dotPingColor,
            )}
          ></span>
        </span>
      )}
      {showText && <span>{type}</span>}
      {children}
    </div>
  );
};
