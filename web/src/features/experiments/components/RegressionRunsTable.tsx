import { useMemo } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { api } from "@/src/utils/api";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";

export type RegressionRunRowData = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  evaluators: string[];
  totalRuns: number;
  promptVariants: string[];
  datasetName: string | null;
  completedRuns: number;
};

type RegressionRunsTableProps = {
  projectId: string;
  experimentId: string;
  onRunSelect?: (run: RegressionRunRowData) => void;
};

export function RegressionRunsTable({
  projectId,
  experimentId,
  onRunSelect,
}: RegressionRunsTableProps) {
  const runsQuery = api.experiments.getRegressionRuns.useQuery({
    projectId,
    experimentId,
    page: 0,
    limit: 50,
  });

  const runs = useMemo<RegressionRunRowData[]>(() => {
    if (!runsQuery.data) return [];
    return runsQuery.data.runs.map((run: any) => ({
      id: run.id,
      name: run.name,
      description: run.description,
      status: run.status ?? "pending",
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      evaluators: run.evaluators ?? [],
      totalRuns: run.totalRuns ?? 0,
      promptVariants: run.promptVariants ?? [],
      datasetName: run.datasetName ?? null,
      completedRuns: run.completedRuns ?? 0,
    }));
  }, [runsQuery.data]);

  if (runsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading regression runs…
      </div>
    );
  }

  if (runsQuery.isError) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        Failed to load regression runs: {runsQuery.error.message}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No regression runs found for this experiment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">{run.name}</h3>
              <Badge variant="secondary">{run.status}</Badge>
            </div>
            {run.description && (
              <p className="text-sm text-muted-foreground">{run.description}</p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span>
                Created: <LocalIsoDate date={run.createdAt} />
              </span>
              <span>Runs per variant: {run.totalRuns}</span>
              <span>Variants: {run.promptVariants.length}</span>
              <span>Evaluators: {run.evaluators.length}</span>
              {run.datasetName ? <span>Dataset: {run.datasetName}</span> : null}
            </div>
          </div>
          {onRunSelect ? (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => onRunSelect(run)}
            >
              View details
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
