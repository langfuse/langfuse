import { cn } from "@/src/utils/tailwind";

export function ActionButtonCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-primary/50 text-primary-foreground flex h-3.5 w-fit items-center justify-center rounded-sm px-1 text-xs shadow-xs",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
