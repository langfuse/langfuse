import { LinkBadge } from "@/src/app/design-system/LinkBadge/LinkBadge";

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
    <LinkBadge
      href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}`}
      newTab
      noCapture
      label="evaluator"
      text={evaluatorName ?? evaluatorId}
    />
  );
}
