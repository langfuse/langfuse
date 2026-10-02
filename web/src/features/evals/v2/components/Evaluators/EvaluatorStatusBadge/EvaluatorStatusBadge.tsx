/* eslint-disable @repo/no-let-assign-in-react */
import Link from "next/link";
import {
  getEvaluatorBlockMetadata,
  type EvaluatorBlockReason,
} from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

type ExecutionSummary = { total: number; failed: number };

function getStatus({
  ruleCount,
  summary,
  blocked,
}: {
  ruleCount: number;
  summary: ExecutionSummary | undefined;
  blocked: boolean;
}) {
  if (blocked) return "Blocked";
  if (ruleCount === 0) return "Inactive";
  if (!summary) return "Unknown";
  if (summary.total === 0) return "Inactive";
  if (summary.failed === 0) return "Healthy";
  return summary.failed / summary.total >= 0.5 ? "Failing" : "Degraded";
}

const colors = {
  Blocked: "red",
  Inactive: "primary",
  Healthy: "green",
  Degraded: "yellow",
  Failing: "red",
  Unknown: "primary",
} as const;

/** Displays evaluator health from execution traces over the last seven days. */
export function EvaluatorStatusBadge({
  ruleCount,
  summary,
  blocked = false,
  blockReason = null,
  blockMessage = null,
  executionsHref,
}: {
  ruleCount: number;
  summary: ExecutionSummary | undefined;
  blocked?: boolean;
  blockReason?: EvaluatorBlockReason | null;
  blockMessage?: string | null;
  executionsHref: string | null;
}) {
  const status = getStatus({ ruleCount, summary, blocked });
  let explanation: string;
  if (status === "Blocked") {
    explanation =
      blockMessage ??
      (blockReason
        ? getEvaluatorBlockMetadata(blockReason).message
        : "This evaluator is blocked.");
  } else if (ruleCount === 0) {
    explanation = "No rule is attached to this evaluator.";
  } else if (status === "Unknown") {
    explanation = "Execution status is unavailable.";
  } else if (status === "Inactive") {
    explanation = "No execution traces in the last 7 days.";
  } else if (status === "Healthy") {
    explanation = "All runs passed in the last 7 days.";
  } else {
    explanation = `${summary?.failed} of ${summary?.total} execution traces failed in the last 7 days.`;
  }

  const badge = (
    <Badge text={status === "Unknown" ? "—" : status} color={colors[status]} />
  );

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {executionsHref ? (
          <Link
            href={executionsHref}
            onClick={(event) => event.stopPropagation()}
            aria-label={`View executions: ${status}`}
            className="focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {badge}
          </Link>
        ) : (
          <span className="inline-flex" tabIndex={0}>
            {badge}
          </span>
        )}
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 text-sm">
        <p>{explanation}</p>
        {executionsHref && (
          <Link
            href={executionsHref}
            onClick={(event) => event.stopPropagation()}
            className="text-primary mt-2 inline-block underline"
          >
            View executions
          </Link>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
