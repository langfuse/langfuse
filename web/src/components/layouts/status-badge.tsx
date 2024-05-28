import { cn } from "@/src/utils/tailwind";

const statusCategories = {
  active: ["production", "live", "active", "pending"],
  inactive: ["disabled", "inactive"],
  completed: ["completed", "done", "finished"],
  error: ["error", "failed"],
};

export type Status =
  (typeof statusCategories)[keyof typeof statusCategories][number];

export const StatusBadge = (props: { className?: string; type: Status }) => {
  let badgeColor = "bg-muted-gray text-primary";
  let dotColor = "bg-muted-foreground";
  let dotPingColor = "bg-muted-foreground";
  let showDot = true;

  if (statusCategories.active.includes(props.type)) {
    badgeColor = "bg-light-green text-dark-green";
    dotColor = "animate-ping bg-dark-green";
    dotPingColor = "bg-dark-green";
  } else if (statusCategories.error.includes(props.type)) {
    badgeColor = "bg-light-red text-dark-red";
    dotColor = "animate-ping bg-dark-red";
    dotPingColor = "bg-dark-red";
    showDot = false;
  } else if (statusCategories.completed.includes(props.type)) {
    badgeColor = "bg-light-green text-dark-green";
    showDot = false;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs",
        badgeColor,
        props.className,
      )}
    >
      {showDot && (
        <span className="relative inline-flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full  rounded-full opacity-75",
              dotColor,
            )}
          ></span>
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full ",
              dotPingColor,
            )}
          ></span>
        </span>
      )}
      <span>{props.type}</span>
    </div>
  );
};
