import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/src/components/design-system/Badge/Badge";

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
      className="ph-no-capture inline-flex"
    >
      <Badge
        text={evaluatorName ? `Evaluator: ${evaluatorName}` : "Evaluator"}
        trailingIcon={ExternalLinkIcon}
      />
    </Link>
  );
}
