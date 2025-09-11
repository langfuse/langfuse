import DiffViewer from "@/src/components/DiffViewer";
import { ScoresTableCell } from "@/src/components/scores-table-cell";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { DialogTrigger } from "@/src/components/ui/dialog";
import { DialogContent } from "@/src/components/ui/dialog";
import { type RunMetrics } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { useDatasetCompareMetrics } from "@/src/features/datasets/contexts/DatasetCompareMetricsContext";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { type Prisma } from "@langfuse/shared";
import {
  ChartNoAxesCombined,
  ClockIcon,
  FileDiffIcon,
  GaugeCircle,
  ListCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";

const DatasetAggregateCell = ({
  scores,
  resourceMetrics,
  traceId,
  projectId,
  observationId,
  scoreKeyToDisplayName,
  actionButtons,
  expectedOutput: output,
  isHighlighted = false,
}: RunMetrics & {
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
  actionButtons?: ReactNode;
  expectedOutput?: Prisma.JsonValue;
  isHighlighted?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedMetrics } = useDatasetCompareMetrics();
  // conditionally fetch the trace or observation depending on the presence of observationId
  const trace = api.traces.byId.useQuery(
    { traceId, projectId },
    {
      enabled: observationId === undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const observation = api.observations.byId.useQuery(
    {
      observationId: observationId as string, // disabled when observationId is undefined
      projectId,
      traceId,
    },
    {
      enabled: observationId !== undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const data = observationId === undefined ? trace.data : observation.data;

  const scoresEntries = Object.entries(scores);

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-md",
        isHighlighted ? "border-4" : "border",
      )}
    >
      {actionButtons}
      <div
        className={cn(
          "flex max-h-[33%] flex-shrink-0 overflow-hidden",
          !selectedMetrics.includes("scores") && "hidden",
        )}
      >
        <div className="w-fit min-w-0 flex-shrink-0 border-r px-1">
          <ChartNoAxesCombined className="mt-2 h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-1 w-full min-w-0 overflow-hidden p-1">
          <div className="flex max-h-full w-full flex-wrap gap-1 overflow-y-auto">
            {scoresEntries.length > 0 ? (
              scoresEntries.map(([key, score]) => (
                <Badge
                  variant="tertiary"
                  className="flex-shrink-0 flex-wrap p-0.5 px-1 font-normal"
                  key={key}
                >
                  <span className="whitespace-nowrap capitalize">
                    {scoreKeyToDisplayName.get(key)}:
                  </span>
                  <span className="ml-[2px]">
                    <ScoresTableCell
                      aggregate={score}
                      showSingleValue
                      wrap={false}
                    />
                  </span>
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No scores</span>
            )}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "flex max-h-fit flex-shrink-0",
          !selectedMetrics.includes("resourceMetrics") && "hidden",
        )}
      >
        <div className="max-h-full w-fit min-w-0 flex-shrink-0 border-r px-1">
          <GaugeCircle className="mt-1 h-4 w-4 text-muted-foreground" />
        </div>
        <div className="max-h-fit w-full min-w-0 p-1">
          <div className="flex w-full flex-row flex-wrap gap-1">
            {!!resourceMetrics.latency && (
              <Badge variant="tertiary" className="p-0.5 px-1 font-normal">
                <ClockIcon className="mb-0.5 mr-1 h-3 w-3" />
                <span className="capitalize">
                  {formatIntervalSeconds(resourceMetrics.latency)}
                </span>
              </Badge>
            )}
            {resourceMetrics.totalCost && (
              <Badge variant="tertiary" className="p-0.5 px-1 font-normal">
                <span className="mr-0.5">{resourceMetrics.totalCost}</span>
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-fit min-w-0 flex-shrink-0 border-r px-1">
          <ListCheck className="mt-1 h-4 w-4 text-muted-foreground" />
        </div>
        <div className="relative w-full min-w-0 overflow-auto p-1">
          <IOTableCell
            isLoading={
              (!!!observationId ? trace.isLoading : observation.isLoading) ||
              !data
            }
            data={data?.output ?? "null"}
            className={"bg-accent-light-green"}
            singleLine={false}
          />
          {output && data?.output && (
            <Dialog
              open={isOpen}
              onOpenChange={(open) => {
                setIsOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Compare expected output with actual output"
                  className="absolute right-2 top-2 rounded bg-background p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100"
                  aria-label="Action button"
                >
                  <FileDiffIcon className="h-4 w-4" />
                </Button>
              </DialogTrigger>

              <DialogContent
                size="xl"
                onClick={(event) => event.stopPropagation()}
              >
                <DialogHeader>
                  <DialogTitle>Expected Output → Actual Output</DialogTitle>
                </DialogHeader>
                <DialogBody>
                  <div className="max-h-[80vh] max-w-screen-xl space-y-6 overflow-y-auto">
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <DiffViewer
                            oldString={JSON.stringify(output, null, 2)}
                            newString={JSON.stringify(
                              data?.output ?? "null",
                              null,
                              2,
                            )}
                            oldLabel="Expected Output"
                            newLabel="Actual Output"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogBody>

                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsOpen(false);
                    }}
                    className="w-full"
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
};

type DatasetAggregateTableCellProps = {
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
  value?: RunMetrics;
  actionButtons?: ReactNode;
  expectedOutput?: Prisma.JsonValue;
  isHighlighted?: boolean;
};

export const DatasetAggregateTableCell = ({
  projectId,
  scoreKeyToDisplayName,
  value,
  actionButtons,
  expectedOutput,
  isHighlighted = false,
}: DatasetAggregateTableCellProps) => {
  return value ? (
    <DatasetAggregateCell
      projectId={projectId}
      {...value}
      scoreKeyToDisplayName={scoreKeyToDisplayName}
      actionButtons={actionButtons}
      expectedOutput={expectedOutput}
      isHighlighted={isHighlighted}
    />
  ) : null;
};
