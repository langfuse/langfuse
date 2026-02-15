import { Card, CardContent } from "@/src/components/ui/card";

type ConfirmationStepProps = {
  displayCount: number;
  selectedEvaluatorNames: string[];
};

export function ConfirmationStep(props: ConfirmationStepProps) {
  const { displayCount, selectedEvaluatorNames } = props;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p>
            <span className="font-medium">Observations:</span> {displayCount}
          </p>
          <p>
            <span className="font-medium">Evaluators:</span>{" "}
            {selectedEvaluatorNames.length}
          </p>
          {selectedEvaluatorNames.length > 0 ? (
            <p>
              <span className="font-medium">Selected:</span>{" "}
              {selectedEvaluatorNames.join(", ")}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Evaluations will run in the background.
      </p>
    </div>
  );
}
