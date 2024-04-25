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
  let badgeColor = "bg-gray-100 text-gray-800";
  let dotColor = "bg-gray-500";
  let dotPingColor = "bg-gray-600";
  let showDot = true;

  if (statusCategories.active.includes(props.type)) {
    badgeColor = "bg-green-100 text-green-600";
    dotColor = "animate-ping bg-green-500";
    dotPingColor = "bg-green-600";
  } else if (statusCategories.error.includes(props.type)) {
    badgeColor = "bg-red-100 text-red-600";
    dotColor = "bg-red-500";
    dotPingColor = "bg-red-600";
    showDot = false;
  } else if (statusCategories.completed.includes(props.type)) {
    badgeColor = "bg-green-100 text-green-600";
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
