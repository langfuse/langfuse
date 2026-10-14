export function EvaluatorCostCalculationTooltipContent({
  calculation,
  explanation,
}: {
  calculation: string | null;
  explanation: string;
}) {
  return (
    <div className="space-y-2">
      {calculation ? (
        <p className="font-mono tabular-nums">{calculation}</p>
      ) : null}
      <p className={calculation ? "text-muted-foreground" : undefined}>
        {explanation}
      </p>
    </div>
  );
}
