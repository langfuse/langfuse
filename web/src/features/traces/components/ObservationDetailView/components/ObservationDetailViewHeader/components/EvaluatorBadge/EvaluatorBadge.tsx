import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

export function EvaluatorBadge({
  evaluatorId,
  evaluatorName,
  projectId,
}: {
  evaluatorId: string;
  evaluatorName?: string | null;
  projectId: string;
}) {
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
