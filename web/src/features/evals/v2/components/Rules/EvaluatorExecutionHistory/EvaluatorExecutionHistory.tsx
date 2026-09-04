import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorExecutionHistory({
  traces,
}: {
  traces: Array<{ id: string; level: string; timestamp: Date }>;
}) {
  if (traces.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">No recent runs</span>
    );
  }

  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={traces
        .map(
          (trace) =>
            `${trace.level.toLowerCase()} at ${trace.timestamp.toLocaleString()}`,
        )
        .join(", ")}
    >
      {[...traces].reverse().map((trace) => (
        <Tooltip key={trace.id}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "block h-4 w-1.5 rounded-full",
                trace.level === "ERROR"
                  ? "bg-destructive"
                  : trace.level === "WARNING"
                    ? "bg-dark-yellow"
                    : "bg-dark-green",
              )}
            />
          </TooltipTrigger>
          <TooltipContent>
            {trace.level.toLowerCase()} at {trace.timestamp.toLocaleString()}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
