import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

export function AgentRecentActivity({
  lastSeen,
  now,
}: {
  lastSeen: Date;
  now: number;
}) {
  const age = now - lastSeen.getTime();
  const recent = age >= 0 && age < 3_600_000;
  const label = recent
    ? "Recorded activity within the last hour"
    : "No recent activity in this selection";
  return (
    <Tooltip label={label}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          role="img"
          aria-label={label}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              recent
                ? "bg-emerald-500 motion-safe:animate-pulse"
                : "bg-muted-foreground/35",
            )}
          />
        </span>
      )}
    </Tooltip>
  );
}
