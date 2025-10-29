import { cn } from "@/src/utils/tailwind";

interface MentionBadgeProps {
  userId: string;
  displayName: string;
  className?: string;
}

export function MentionBadge({
  userId,
  displayName,
  className,
}: MentionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        className,
      )}
      data-user-id={userId}
    >
      @{displayName}
    </span>
  );
}
