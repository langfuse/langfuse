import { cn } from "@/src/utils/tailwind";

export const StatusBadge = (props: {
  className?: string;

  type: "live" | "disabled";
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm px-3",
        props.type === "live"
          ? " bg-green-100 text-green-600"
          : "bg-gray-100 text-gray-800",
        props.className,
      )}
    >
      <span className="relative flex h-2 w-2 ">
        <span
          className={cn(
            "absolute inline-flex h-full w-full  rounded-full opacity-75",
            props.type === "live" ? "animate-ping bg-green-500" : "bg-gray-500",
          )}
        ></span>
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full ",
            props.type === "live" ? "bg-green-600" : "bg-gray-600",
          )}
        ></span>
      </span>
      {props.type === "live" ? "Live" : "Disabled"}
    </div>
  );
};
