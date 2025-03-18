import DocPopup from "@/src/components/layouts/doc-popup";
import PeekView from "@/src/components/layouts/peek-view";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { ObservationTree } from "@/src/components/trace/ObservationTree";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/src/components/ui/resizable";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { type DatasetCompareRunRowData } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { PanelLeftOpen, PanelLeftClose, ListTree } from "lucide-react";
import { useRouter } from "next/router";

export function DatasetCompareRunPeekView({
  projectId,
  datasetId,
  scoreKeyToDisplayName,
  clickedRow,
  setClickedRow,
  traceAndObservationId,
  setTraceAndObservationId,
  runsData,
}: {
  projectId: string;
  datasetId: string;
  scoreKeyToDisplayName: Map<string, string>;
  clickedRow: DatasetCompareRunRowData | null;
  setClickedRow: (row: DatasetCompareRunRowData | null) => void;
  traceAndObservationId: {
    runId: string;
    traceId: string;
    observationId?: string;
  } | null;
  setTraceAndObservationId: (
    id: { runId: string; traceId: string; observationId?: string } | null,
  ) => void;
  runsData: RouterOutputs["datasets"]["baseRunDataByDatasetId"];
}) {
  const router = useRouter();

  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(decodeURIComponent(router.query.timestamp))
      : undefined;

  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: traceAndObservationId?.traceId as string,
      projectId,
      timestamp,
    },
    {
      enabled: !!traceAndObservationId,
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
    },
  );

  const onClose = () => {
    setClickedRow(null);
    setTraceAndObservationId(null);
  };

  return (
    <PeekView
      onClose={onClose}
      item={{
        name: clickedRow?.id ?? "item",
        type: "Dataset item",
        link: `/project/${projectId}/datasets/${datasetId}/items/${clickedRow?.id}`,
      }}
      open={!!clickedRow}
      actionButtons={
        <>
          {traceAndObservationId?.traceId && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTraceAndObservationId(null)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </>
      }
    >
      <div
        className={cn(
          "grid gap-4 md:h-full",
          traceAndObservationId?.traceId
            ? "grid-cols-[1fr,3fr]"
            : "grid-cols-1",
        )}
      >
        {traceAndObservationId?.traceId && (
          <Card className="h-full overflow-y-auto p-2">
            {trace.data ? (
              <ObservationTree
                observations={trace.data?.observations ?? []}
                collapsedObservations={[]}
                toggleCollapsedObservation={() => {}}
                collapseAll={() => {}}
                expandAll={() => {}}
                trace={trace.data}
                scores={trace.data?.scores ?? []}
                currentObservationId={undefined}
                setCurrentObservationId={(id) => {
                  if (id)
                    window.open(
                      `/project/${projectId}/traces/${encodeURIComponent(traceAndObservationId?.traceId)}?observation=${encodeURIComponent(id)}`,
                      "_blank",
                      "noopener noreferrer",
                    );
                }}
                showComments={false}
                showMetrics={false}
                showScores={true}
                colorCodeMetrics={false}
                className="flex w-full flex-col overflow-y-auto"
                showExpandControls={false}
              />
            ) : (
              <Skeleton className="min-h-full w-full" />
            )}
          </Card>
        )}
        <div className="grid h-full grid-rows-[minmax(0,1fr)] overflow-hidden">
          <ResizablePanelGroup direction="vertical" className="overflow-hidden">
            <ResizablePanel
              minSize={30}
              className="mb-2 min-h-0 overflow-hidden"
            >
              <div className="grid h-full grid-cols-2 gap-4">
                <div className="min-h-0 overflow-hidden">
                  <h3 className="font-lg mb-1 font-semibold">Input</h3>
                  <div className="h-[calc(100%-1.75rem)] space-y-2 overflow-y-auto">
                    <IOPreview
                      key={clickedRow?.id + "-input"}
                      input={clickedRow?.input ?? null}
                      hideOutput
                    />
                  </div>
                </div>
                <div className="min-h-0 overflow-hidden">
                  <h3 className="font-lg mb-1 font-semibold">
                    Expected output
                  </h3>
                  <div className="h-[calc(100%-1.75rem)] space-y-2 overflow-y-auto">
                    <IOPreview
                      key={clickedRow?.id + "-output"}
                      output={clickedRow?.expectedOutput ?? null}
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
              className="mt-2 min-h-0 overflow-hidden"
            >
              <h3 className="font-lg mb-1 font-semibold">Run outputs</h3>
              {clickedRow?.runs && (
                <div className="flex h-[calc(100%-2rem)] w-full gap-4 overflow-x-auto">
                  {Object.entries(clickedRow.runs).map(([id, run]) => {
                    const runData = runsData?.find((r) => r.id === id);
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
                          selectedMetrics={["scores", "resourceMetrics"]}
                          singleLine={false}
                          variant="peek"
                          className={cn(
                            "relative flex-1 overflow-y-auto",
                            traceAndObservationId?.runId === id && "border-4",
                          )}
                          actionButtons={
                            <div className="absolute right-1 top-1 z-10 hidden items-center justify-center gap-1 group-hover:flex">
                              <Button
                                variant="outline"
                                size="icon"
                                title="View full trace"
                                onClick={() =>
                                  window.open(
                                    run?.observationId
                                      ? `/project/${projectId}/traces/${encodeURIComponent(run.traceId)}?observation=${encodeURIComponent(run.observationId)}`
                                      : `/project/${projectId}/traces/${encodeURIComponent(run.traceId)}`,
                                    "_blank",
                                    "noopener noreferrer",
                                  )
                                }
                              >
                                <ListTree className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                title="View trace tree"
                                onClick={() =>
                                  setTraceAndObservationId({
                                    traceId: run.traceId,
                                    observationId: run.observationId,
                                    runId: id,
                                  })
                                }
                              >
                                <PanelLeftOpen className="h-4 w-4" />
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
    </PeekView>
  );
}
