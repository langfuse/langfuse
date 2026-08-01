import { type JobExecutionStatus } from "@langfuse/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

const statusColor: Record<JobExecutionStatus, string> = {
  COMPLETED: "bg-green-500",
  ERROR: "bg-red-500",
  PENDING: "bg-blue-500",
  DELAYED: "bg-amber-500",
  CANCELLED: "bg-muted-foreground/50",
};

type EvaluationRuleExecution = {
  id: string;
  status: JobExecutionStatus;
  updatedAt: Date;
  executionTraceId: string | null;
  jobConfiguration: { scoreName: string };
};

function executionLabel(execution: EvaluationRuleExecution) {
  return `${execution.jobConfiguration.scoreName}: ${execution.status.toLowerCase()} at ${execution.updatedAt.toLocaleString()}`;
}

export function EvaluationRuleExecutionStatusHistory({
  executions,
}: {
  executions: EvaluationRuleExecution[];
}) {
  if (executions.length === 0) {
    return <span className="text-muted-foreground text-xs">No runs</span>;
  }

  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={executions.map(executionLabel).join(", ")}
    >
      {[...executions].reverse().map((execution) => (
        <Tooltip key={execution.id}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "block h-4 w-1.5 rounded-full",
                statusColor[execution.status],
              )}
            />
          </TooltipTrigger>
          <TooltipContent>{executionLabel(execution)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function EvaluationRuleExecutionTraceStatusHistory({
  traces,
}: {
  traces: Array<{ id: string; level: string; timestamp: Date }>;
}) {
  if (traces.length === 0) {
    return <span className="text-muted-foreground text-xs">No runs yet</span>;
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
                  ? "bg-red-500"
                  : trace.level === "WARNING"
                    ? "bg-amber-500"
                    : "bg-green-500",
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
