import { type ObservationLevelType } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

export function StatusMessage({
  level,
  message,
  size,
}: {
  level: ObservationLevelType;
  message: string;
  size: "default" | "compact";
}) {
  return (
    <div
      className={cn(
        "ph-no-capture rounded-md px-3 py-2 wrap-break-word whitespace-pre-wrap",
        (
          { default: "text-base", compact: "text-sm" } satisfies Record<
            typeof size,
            string
          >
        )[size],
        (
          {
            ERROR:
              "dark:border-dark-red/20 dark:bg-light-red/35 border border-red-100 bg-red-50 text-red-900 dark:text-red-300",
            WARNING:
              "dark:border-dark-yellow/20 dark:bg-light-yellow/35 border border-yellow-100 bg-yellow-50 text-yellow-900 dark:text-yellow-300",
            DEFAULT: "bg-surface-output text-foreground-secondary",
            DEBUG: "bg-surface-output text-foreground-secondary",
          } satisfies Record<ObservationLevelType, string>
        )[level],
      )}
    >
      {message}
    </div>
  );
}
