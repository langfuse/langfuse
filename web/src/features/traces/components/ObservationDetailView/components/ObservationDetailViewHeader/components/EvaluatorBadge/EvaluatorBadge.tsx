/* eslint-disable @repo/no-null-render */
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

export function EvaluatorBadge({
  evaluatorId,
  evaluatorName,
  environment,
  projectId,
}: {
  evaluatorId: string | null;
  evaluatorName?: string | null;
  environment: string;
  projectId: string;
}) {
  const isEvaluatorExecution =
    environment === LangfuseInternalTraceEnvironment.LLMJudge ||
    environment === LangfuseInternalTraceEnvironment.CodeEval;
  const isManagedTemplate = evaluatorId?.startsWith("managed:") ?? false;
  if (!evaluatorId || !isEvaluatorExecution || isManagedTemplate) return null;

  return (
    <Link
      href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={evaluatorName ? `Evaluator: ${evaluatorName}` : "Evaluator"}
      className="ph-no-capture text-muted-foreground hover:text-foreground inline-flex max-w-48 items-center gap-1 text-xs hover:underline"
    >
      <span
        className="truncate"
        title={evaluatorName ? `Evaluator: ${evaluatorName}` : "Evaluator"}
      >
        {evaluatorName ? `Evaluator: ${evaluatorName}` : "Evaluator"}
      </span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}
