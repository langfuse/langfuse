/* eslint-disable @repo/no-null-render */
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/src/components/design-system/Badge/Badge";

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
      className="ph-no-capture inline-flex"
    >
      <Badge
        text={evaluatorName ? `Evaluator: ${evaluatorName}` : "Evaluator"}
        trailingIcon={ExternalLinkIcon}
      />
    </Link>
  );
}
