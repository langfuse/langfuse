import { cn } from "@/src/utils/tailwind";

// The raw palette values are intentional — the semantic warning/success fills
// read too muted at this size.
export function V4MigrationStatusDot({
  variant,
}: {
  // "neutral" marks optional helpers in the checklist — neither pending
  // work (amber) nor a completed check (green).
  variant: "action" | "done" | "neutral";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.75 shrink-0 rounded-full",
        variant === "action" && "bg-orange-400 dark:bg-orange-400",
        variant === "done" && "bg-green-400 dark:bg-green-400",
        variant === "neutral" && "bg-gray-400 dark:bg-gray-400",
      )}
    />
  );
}
