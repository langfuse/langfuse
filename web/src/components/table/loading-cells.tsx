import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";

export function TableCheckboxLoadingCell({
  className,
}: {
  className?: string;
}) {
  return <Skeleton className={cn("h-4 w-4 shrink-0 rounded-sm", className)} />;
}

export function TableIconButtonLoadingCell({
  className,
  size = "xs",
}: {
  className?: string;
  size?: "xs" | "default";
}) {
  return (
    <Skeleton
      className={cn(
        "shrink-0 rounded-full",
        size === "xs" ? "h-5 w-5" : "h-7 w-7",
        className,
      )}
    />
  );
}

export function TableIconBadgeLoadingCell({
  className,
}: {
  className?: string;
}) {
  return <Skeleton className={cn("h-5 w-6 shrink-0 rounded-md", className)} />;
}

export function TableBadgeLoadingCell({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-16 shrink-0 rounded-sm", className)} />;
}

export function TableTextLoadingCell({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-1/2", className)} />;
}
