import DocPopup from "@/src/components/layouts/doc-popup";
import Header from "@/src/components/layouts/header";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { ObservationTree } from "@/src/components/trace/ObservationTree";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { type DatasetCompareRunRowData } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { PanelLeftOpen, PanelLeftClose, X, ListTree } from "lucide-react";
import { useState } from "react";

export function DatasetCompareRunPeekView({
  projectId,
  scoreKeyToDisplayName,
  clickedRow,
  setClickedRow,
  runsData,
}: {
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
  clickedRow: DatasetCompareRunRowData | null;
  setClickedRow: (row: DatasetCompareRunRowData | null) => void;
  runsData: RouterOutputs["datasets"]["baseRunDataByDatasetId"];
}) {
  const [traceAndObservationId, setTraceAndObservationId] = useState<{
    runId: string;
    traceId: string;
    observationId?: string;
  } | null>(null);

  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    { traceId: traceAndObservationId?.traceId as string, projectId },
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
    <Drawer
      key={clickedRow?.id ?? "closed"}
      open={!!clickedRow}
      modal={false}
      onClose={onClose}
    >
      <DrawerContent size="lg" className="mx-auto">
        <DrawerHeader className="sticky top-0 z-10 flex flex-row items-center justify-between rounded-sm bg-background">
          <DrawerTitle className="flex flex-row items-center gap-2">
            {traceAndObservationId?.traceId && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTraceAndObservationId(null)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
            <Header title="Comparing traces" level="h3"></Header>
          </DrawerTitle>
          <DrawerClose asChild onClick={onClose}>
            <Button variant="outline" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div
          data-vaul-no-drag
          className="mb-4 h-full flex-1 gap-4 overflow-hidden px-4"
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
                    setCurrentObservationId={() => {}}
                    showMetrics={false}
                    showScores={true}
                    colorCodeMetrics={false}
                    className="flex w-full flex-col overflow-y-auto"
                  />
                ) : (
                  <Skeleton className="min-h-full w-full" />
                )}
              </Card>
            )}
            <div className="flex h-full flex-col overflow-hidden">
              <Accordion
                type="multiple"
                defaultValue={["item-2"]}
                className="min-h-0 flex-1 overflow-y-auto"
              >
                <AccordionItem value="item-1">
                  <AccordionTrigger>Input & expected output</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <IOPreview
                      key={clickedRow?.id + "-io"}
                      input={clickedRow?.input ?? undefined}
                      output={clickedRow?.expectedOutput ?? undefined}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2" className="border-b-0">
                  <AccordionTrigger>Run outputs</AccordionTrigger>
                  <AccordionContent className="mb-2 grid grid-rows-[auto,1fr] gap-2 overflow-y-hidden">
                    {clickedRow?.runs && (
                      <div className="flex w-full gap-4 overflow-x-auto overflow-y-hidden">
                        {Object.entries(clickedRow.runs).map(([id, run]) => {
                          const runData = runsData?.find((r) => r.id === id);
                          return (
                            <div
                              key={id}
                              className="h-[50dvh] w-[45%] flex-none overflow-y-auto"
                            >
                              <div className="mb-1 flex items-center text-sm font-medium">
                                {runData?.name ?? id}
                                {runData?.description && (
                                  <DocPopup
                                    description={runData?.description}
                                  />
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
                                  "relative max-h-[45dvh]",
                                  traceAndObservationId?.runId === id &&
                                    "border-4",
                                )}
                                actionButtons={
                                  <div className="z-5 absolute right-1 top-1 hidden items-center justify-center gap-1 group-hover:flex">
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="h-1 w-full border-b"></div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
