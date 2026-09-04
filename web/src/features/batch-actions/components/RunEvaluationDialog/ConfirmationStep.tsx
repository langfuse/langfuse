import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import { EstimatedCostRow } from "./EstimatedCostRow";
import type { BatchEvalSourceTable } from "@langfuse/shared";
import { getBatchEvalCostObservationCount } from "./utils";

type ConfirmationStepProps = {
  projectId: string;
  displayCount: number;
  evaluators: Array<{ id: string; name: string }>;
  hideCount: boolean;
  sourceTable: BatchEvalSourceTable;
};

export function ConfirmationStep(props: ConfirmationStepProps) {
  const { projectId, displayCount, evaluators, hideCount, sourceTable } = props;

  const effectiveObservationCount = getBatchEvalCostObservationCount({
    displayCount,
    sourceTable,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          {!hideCount && (
            <div className="flex gap-2">
              <span className="text-muted-foreground">Observations:</span>
              <span className="font-bold">{displayCount}</span>
            </div>
          )}

          {evaluators.length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">
                Evaluators:
              </span>
              <div className="flex flex-wrap gap-1">
                {evaluators.map((e) => (
                  <Badge key={e.id} variant="secondary" className="text-xs">
                    {e.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {effectiveObservationCount == null ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">
                Est. LLM API Key Cost:
              </span>
              <span className="text-muted-foreground text-xs">
                Cost estimate unavailable for experiment-scoped evaluations
              </span>
            </div>
          ) : (
            <EstimatedCostRow
              projectId={projectId}
              evaluators={evaluators}
              observationCount={effectiveObservationCount}
            />
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        Evaluations will run in the background.
      </p>
    </div>
  );
}
