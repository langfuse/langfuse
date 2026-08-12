import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";

export function ActivationCostEstimateView({
  estimates,
}: {
  estimates: Array<{
    evaluatorId: string;
    evaluatorName: string;
    matchingObservations: number;
    sampling: number;
    testRunCostUsd: number;
    estimatedCostUsd: number;
  }>;
}) {
  const totalCostUsd = estimates.reduce(
    (total, estimate) => total + estimate.estimatedCostUsd,
    0,
  );

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-auto px-4 py-2 font-mono text-[10px] tracking-wider uppercase">
              Evaluator
            </TableHead>
            <TableHead className="h-auto w-40 px-4 py-2 text-right font-mono text-[10px] tracking-wider uppercase">
              Estimated cost
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-sm">
          {estimates.map((estimate) => {
            const sampledObservations = Math.round(
              estimate.matchingObservations * estimate.sampling,
            );

            return (
              <TableRow key={estimate.evaluatorId}>
                <TableCell density="comfortable" className="px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate" title={estimate.evaluatorName}>
                      {estimate.evaluatorName}
                    </p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs tabular-nums">
                      {compactNumberFormatter(sampledObservations, 1)} ×{" "}
                      {usdFormatter(estimate.testRunCostUsd)}
                    </p>
                  </div>
                </TableCell>
                <TableCell
                  density="comfortable"
                  className="px-4 py-3 text-right align-top font-mono tabular-nums"
                >
                  {usdFormatter(estimate.estimatedCostUsd, 2, 2)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-muted/30">
          <TableRow className="hover:bg-transparent">
            <TableCell density="comfortable" className="px-4 py-3 text-sm">
              Estimated cost, 7 days
            </TableCell>
            <TableCell
              density="comfortable"
              className="px-4 py-3 text-right font-mono text-base tabular-nums"
            >
              ≈ {usdFormatter(totalCostUsd, 2, 2)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
