import { Check, TriangleAlert } from "lucide-react";

export function EvaluationRuleMappingStatus({
  mappedCount,
  variableCount,
}: {
  mappedCount: number;
  variableCount: number;
}) {
  const complete = mappedCount === variableCount;

  return (
    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
      {mappedCount}/{variableCount}{" "}
      {variableCount === 1 ? "variable" : "variables"} mapped
      {complete ? (
        <Check
          className="text-dark-green h-3.5 w-3.5"
          aria-label="All variables mapped"
        />
      ) : (
        <TriangleAlert
          className="text-dark-yellow h-3.5 w-3.5"
          aria-label="Some variables are not mapped"
        />
      )}
    </span>
  );
}
