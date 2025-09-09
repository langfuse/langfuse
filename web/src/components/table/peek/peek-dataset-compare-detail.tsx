import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/src/components/ui/resizable";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { TraceTree } from "@/src/components/trace/TraceTree";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type RouterOutputs } from "@/src/utils/api";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { Button } from "@/src/components/ui/button";
import { PanelLeftOpen, PanelLeftClose, ListTree } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Command } from "@/src/components/ui/command";
import React, { useMemo } from "react";
import { buildTraceUiData } from "@/src/components/trace/lib/helpers";
import { usePeekRunsCompareData } from "@/src/components/table/peek/hooks/usePeekRunsCompareData";
import { type RunMetrics } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { useRouter } from "next/router";
import { usePeekCompareDetail } from "@/src/components/table/peek/hooks/usePeekCompareDetail";

const convertRunDataToRunMetrics = (
  runData: RouterOutputs["datasets"]["runitemsByRunIdOrItemId"]["runItems"][number],
): RunMetrics => {
  return {
    id: runData.id,
    scores: runData.scores,
    resourceMetrics: {
      latency: runData.observation?.latency ?? runData.trace.duration,
      totalCost:
        runData.observation?.calculatedTotalCost.toString() ??
        runData.trace.totalCost.toString(),
    },
    traceId: runData.trace.id,
    observationId: runData.observation?.id,
  };
};

export type PeekDatasetCompareDetailProps = {
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
};

export const PeekDatasetCompareDetail = ({
  projectId,
  scoreKeyToDisplayName,
}: PeekDatasetCompareDetailProps) => {
  const router = useRouter();
  // path params
  const datasetId = router.query.datasetId as string | undefined;
  // query params
  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;
  const traceId = router.query.traceId as string | undefined;
  const datasetItemId = router.query.peek as string | undefined;
  const runs = router.query.runs as string[] | undefined;

  const {
    collapsedNodes,
    toggleCollapsedNode,
    handleSetCurrentObservationId,
    handleToggleTrace,
  } = usePeekCompareDetail(projectId);

  const { trace, runItems, datasetItem } = usePeekRunsCompareData({
    projectId,
    traceId: traceId,
    datasetId,
    datasetItemId,
    timestamp,
    runs,
  });

  const tree = useMemo(() => {
    if (!trace.data) return null;

    const { tree } = buildTraceUiData(
      trace.data,
      trace.data.observations ?? [],
      "DEFAULT",
    );

    return tree;
  }, [trace.data]);

  if (!runItems.data || !datasetItem.data) {
    return <Skeleton className="min-h-full w-full" />;
  }

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
              <h3 className="mb-3 font-semibold">
                Run:{" "}
                {
                  runItems.data.runItems?.find(
                    (runItem) => runItem.trace.id === traceId,
                  )?.datasetRunName
                }
              </h3>
              {tree && (
                <TraceTree
                  tree={tree}
                  collapsedNodes={collapsedNodes}
                  toggleCollapsedNode={toggleCollapsedNode}
                  scores={trace.data?.scores ?? []}
                  currentNodeId={undefined}
                  setCurrentNodeId={handleSetCurrentObservationId}
                  showMetrics={false}
                  showScores={true}
                  colorCodeMetrics={false}
                  showComments={false}
                  className="flex w-full flex-col overflow-y-auto"
                />
              )}
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
                    input={datasetItem.data.input ?? null}
                    hideOutput
                  />
                </div>
              </div>
              <div className="min-h-0 overflow-hidden">
                <h3 className="mb-1 font-semibold">Expected output</h3>
                <div className="h-[calc(100%-1.75rem)] space-y-2 overflow-y-auto">
                  <IOPreview
                    key={datasetItemId + "-output"}
                    output={datasetItem.data.expectedOutput ?? null}
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
            {runItems.data.runItems && (
              <div className="flex h-[calc(100%-2rem)] w-full gap-4 overflow-x-auto">
                {runItems.data.runItems.map((runItem) => {
                  const runData = runItems.data.runItems.find(
                    (r) => r.id === runItem.id,
                  );
                  if (!runData) return null;
                  const runMetrics = convertRunDataToRunMetrics(runData);

                  return (
                    <div
                      key={runItem.id}
                      className="flex w-[45%] flex-none flex-col overflow-hidden"
                    >
                      <div className="mb-1 flex items-center text-sm font-medium">
                        {runData.datasetRunName ?? runMetrics.id}
                      </div>
                      <DatasetAggregateTableCell
                        value={runMetrics}
                        projectId={projectId}
                        scoreKeyToDisplayName={scoreKeyToDisplayName}
                        expectedOutput={
                          datasetItem.data?.expectedOutput ?? null
                        }
                        isHighlighted={runItem.trace.id === traceId}
                        actionButtons={
                          <div className="absolute right-1 top-1 z-10 hidden items-center justify-center gap-1 group-hover:flex">
                            <Button
                              variant="outline"
                              size="icon"
                              title="View full trace"
                              onClick={() => {
                                const pathname = runMetrics?.observationId
                                  ? `/project/${projectId}/traces/${encodeURIComponent(runMetrics.traceId)}?observation=${encodeURIComponent(runMetrics.observationId)}`
                                  : `/project/${projectId}/traces/${encodeURIComponent(runMetrics.traceId)}`;
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
                                traceId === runMetrics.traceId
                                  ? "Hide trace tree"
                                  : "View trace tree"
                              }
                              onClick={() =>
                                handleToggleTrace(runMetrics.traceId)
                              }
                            >
                              {traceId === runMetrics.traceId ? (
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
