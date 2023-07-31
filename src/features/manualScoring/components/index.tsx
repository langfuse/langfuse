import { Button } from "@/src/components/ui/button";
import { type Observation, type Score } from "@prisma/client";

const SCORE_NAME = "Manual Evaluation";

export const ManualScoreButton = ({
  projectId,
  traceId,
  scores,
  observationId,
}: {
  projectId: string;
  traceId: string;
  scores: Score[];
  observationId?: string;
}) => {
  const score = scores.find(
    (s) =>
      s.name === SCORE_NAME &&
      s.traceId === traceId &&
      (observationId !== undefined
        ? s.observationId === observationId
        : s.observationId === null)
  );

  return (
    <Button variant="default">
      {score ? `Edit manual score: ${score.value}` : "Manual score"}
    </Button>
  );
};
