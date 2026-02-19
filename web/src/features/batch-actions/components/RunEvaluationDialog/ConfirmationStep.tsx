import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import { EstimatedCostRow } from "./EstimatedCostRow";

type ConfirmationStepProps = {
  projectId: string;
  displayCount: number;
  evaluators: Array<{ id: string; name: string }>;
};

export function ConfirmationStep(props: ConfirmationStepProps) {
  const { projectId, displayCount, evaluators } = props;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground">Observations:</span>
            <span className="font-medium">{displayCount}</span>
          </div>

          {evaluators.length > 0 && (
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">
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

          <EstimatedCostRow
            projectId={projectId}
            evaluators={evaluators}
            observationCount={displayCount}
          />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Evaluations will run in the background.
      </p>
    </div>
  );
}
