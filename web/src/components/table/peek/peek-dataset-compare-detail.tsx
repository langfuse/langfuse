import { useDatasetComparePeekState } from "@/src/components/table/peek/hooks/useDatasetComparePeekState";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/src/components/ui/resizable";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { ObservationTree } from "@/src/components/trace/ObservationTree";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type RouterOutputs } from "@/src/utils/api";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { Button } from "@/src/components/ui/button";
import { PanelLeftOpen, PanelLeftClose, ListTree } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Command } from "@/src/components/ui/command";
import DocPopup from "@/src/components/layouts/doc-popup";
import type { DatasetCompareRunRowData } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { useRouter } from "next/router";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";

export type PeekDatasetCompareDetailProps = {
  projectId: string;
  runsData: RouterOutputs["datasets"]["baseRunDataByDatasetId"];
  scoreKeyToDisplayName: Map<string, string>;
  row?: DatasetCompareRunRowData;
};

export const PeekDatasetCompareDetail = ({
  projectId,
  runsData,
  scoreKeyToDisplayName,
  row,
}: PeekDatasetCompareDetailProps) => {
  const router = useRouter();

  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;

  const { datasetItemId, selectedRunItemProps, setSelectedRunItemProps } =
    useDatasetComparePeekState();
  const { runId, traceId } = selectedRunItemProps ?? {};

  const trace = usePeekData({
    projectId,
    traceId: traceId,
    timestamp,
  });

  const handleToggleTrace = (
    newTraceId?: string,
    newRunId?: string,
    newObservationId?: string,
  ) => {
    if (!newTraceId || !newRunId) return;

    if (newTraceId === traceId) {
      setSelectedRunItemProps(null);
    } else {
      setSelectedRunItemProps({
        runId: newRunId,
        traceId: newTraceId,
        observationId: newObservationId,
      });
    }
  };

  const handleSetCurrentObservationId = (id?: string) => {
    if (id && traceId) {
      const pathname = `/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(id)}`;
      const pathnameWithBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${pathname}`;
      window.open(pathnameWithBasePath, "_blank", "noopener noreferrer");
    }
  };

  if (!row) return <Skeleton className="min-h-full w-full" />;

  return (
    <div
      className={cn(
        "grid md:h-full",
        traceId ? "grid-cols-[1fr,3fr]" : "grid-cols-1",
      )}
    >
      {traceId && (
        <div className="h-full overflow-y-auto border-r p-2">
          {trace.data ? (
            <Command>
              <h3 className="mb-3 font-semibold">{`Run: ${
                runsData?.find((r: any) => r.id === runId)?.name
              }`}</h3>
              <ObservationTree
                observations={trace.data?.observations ?? []}
                collapsedObservations={[]}
                toggleCollapsedObservation={() => {}}
                collapseAll={() => {}}
                expandAll={() => {}}
                trace={trace.data}
                scores={trace.data.scores ?? []}
                currentObservationId={undefined}
                setCurrentObservationId={handleSetCurrentObservationId}
                showComments={false}
                showMetrics={false}
                showScores={true}
                colorCodeMetrics={false}
                className="flex w-full flex-col overflow-y-auto"
                showExpandControls={false}
              />
            </Command>
          ) : (
            <Skeleton className="min-h-full w-full" />
          )}
        </div>
      )}
      <div className="grid h-full grid-rows-[minmax(0,1fr)] overflow-hidden">
        <ResizablePanelGroup direction="vertical" className="overflow-hidden">
          <ResizablePanel
            minSize={30}
            className="mb-2 min-h-0 overflow-hidden p-2 pl-3"
          >
            <div className="grid h-full grid-cols-2 gap-4">
              <div className="min-h-0 overflow-hidden">
                <h3 className="mb-1 font-semibold">Input</h3>
                <div className="h-[calc(100%-1.75rem)] space-y-2 overflow-y-auto">
                  <IOPreview
                    key={datasetItemId + "-input"}
                    input={row?.input ?? null}
                    hideOutput
                  />
                </div>
              </div>
              <div className="min-h-0 overflow-hidden">
                <h3 className="mb-1 font-semibold">Expected output</h3>
                <div className="h-[calc(100%-1.75rem)] space-y-2 overflow-y-auto">
                  <IOPreview
                    key={datasetItemId + "-output"}
                    output={row?.expectedOutput ?? null}
                    hideInput
                  />
                </div>
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border" />
          <ResizablePanel
            minSize={30}
            defaultSize={50}
            className="mt-2 min-h-0 overflow-hidden p-2 pl-3"
          >
            <h3 className="mb-1 font-semibold">Run outputs</h3>
            {row?.runs && (
              <div className="flex h-[calc(100%-2rem)] w-full gap-4 overflow-x-auto">
                {Object.entries(row.runs).map(([id, run]) => {
                  const runData = runsData?.find((r: any) => r.id === id);
                  return (
                    <div
                      key={id}
                      className="flex w-[45%] flex-none flex-col overflow-hidden"
                    >
                      <div className="mb-1 flex items-center text-sm font-medium">
                        {runData?.name ?? id}
                        {runData?.description && (
                          <DocPopup description={runData?.description} />
                        )}
                      </div>
                      <DatasetAggregateTableCell
                        value={run}
                        projectId={projectId}
                        scoreKeyToDisplayName={scoreKeyToDisplayName}
                        output={row.expectedOutput}
                        isHighlighted={id === runId}
                        actionButtons={
                          <div className="absolute right-1 top-1 z-10 hidden items-center justify-center gap-1 group-hover:flex">
                            <Button
                              variant="outline"
                              size="icon"
                              title="View full trace"
                              onClick={() => {
                                const pathname = run?.observationId
                                  ? `/project/${projectId}/traces/${encodeURIComponent(run.traceId)}?observation=${encodeURIComponent(run.observationId)}`
                                  : `/project/${projectId}/traces/${encodeURIComponent(run.traceId)}`;
                                const pathnameWithBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${pathname}`;
                                window.open(
                                  pathnameWithBasePath,
                                  "_blank",
                                  "noopener noreferrer",
                                );
                              }}
                            >
                              <ListTree className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="outline"
                              size="icon"
                              title={
                                traceId === run.traceId
                                  ? "Hide trace tree"
                                  : "View trace tree"
                              }
                              onClick={() =>
                                handleToggleTrace(
                                  run.traceId,
                                  id,
                                  run.observationId,
                                )
                              }
                            >
                              {traceId === run.traceId ? (
                                <PanelLeftClose className="h-4 w-4" />
                              ) : (
                                <PanelLeftOpen className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};
