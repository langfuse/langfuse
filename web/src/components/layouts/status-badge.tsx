import { cn } from "@/src/utils/tailwind";

const statusCategories = {
  active: ["production", "live", "active"],
  inactive: ["disabled", "inactive"],
};

export type Status =
  (typeof statusCategories)[keyof typeof statusCategories][number];

export const StatusBadge = (props: { className?: string; type: Status }) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs",
        statusCategories.active.includes(props.type)
          ? " bg-green-100 text-green-600"
          : "bg-gray-100 text-gray-800",
        props.className,
      )}
    >
      <span className="relative inline-flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full  rounded-full opacity-75",
            statusCategories.active.includes(props.type)
              ? "animate-ping bg-green-500"
              : "bg-gray-500",
          )}
        ></span>
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full ",
            statusCategories.active.includes(props.type)
              ? "bg-green-600"
              : "bg-gray-600",
          )}
        ></span>
      </span>
      <span>{props.type}</span>
    </div>
  );
};
