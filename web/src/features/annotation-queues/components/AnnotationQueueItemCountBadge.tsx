import { cn } from "@/src/utils/tailwind";

type AnnotationQueueItemCountBadgeProps = {
  totalCount: number;
  layout: "toolbar" | "menu";
};

export function AnnotationQueueItemCountBadge({
  totalCount,
  layout,
}: AnnotationQueueItemCountBadgeProps) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground flex items-center justify-center rounded-sm font-bold shadow-xs",
        layout === "toolbar"
          ? "absolute -top-1 left-2.5 h-3 min-w-3 px-0.5 text-[8px]"
          : "ml-auto h-3.5 w-fit px-1 text-xs font-normal",
      )}
    >
      {totalCount > 99 ? "99+" : totalCount}
    </span>
  );
}
