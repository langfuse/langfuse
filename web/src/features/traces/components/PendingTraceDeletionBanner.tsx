import { Info } from "@langfuse/icons";

export function PendingTraceDeletionBanner() {
  return (
    <p
      role="status"
      className="text-foreground-secondary flex items-start gap-1.5 text-xs"
    >
      <span className="flex h-4 shrink-0 translate-y-px items-center">
        <Info size="sm" color="tertiary" aria-hidden />
      </span>
      <span>
        Deletion in progress. This trace will be removed within 24 hours.
      </span>
    </p>
  );
}
