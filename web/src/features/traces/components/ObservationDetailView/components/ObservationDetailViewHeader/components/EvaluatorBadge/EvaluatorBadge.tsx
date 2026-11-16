import { Metric } from "@/src/components/design-system/Metric/Metric";

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
    <Metric
      href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}`}
      newTab
      noCapture
      label="evaluator"
      value={evaluatorName ?? evaluatorId}
    />
  );
}
