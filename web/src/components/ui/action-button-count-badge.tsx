import { cn } from "@/src/utils/tailwind";

export function ActionButtonCountBadge({
  count,
  variant = "default",
}: {
  count: number;
  /** "muted" for quiet contexts (e.g. tab labels) where the primary fill shouts. */
  variant?: "default" | "muted";
}) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-fit items-center justify-center rounded-sm px-1 text-xs",
        variant === "muted"
          ? "bg-muted text-muted-foreground"
          : "bg-primary/50 text-primary-foreground shadow-xs",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
