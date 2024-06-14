import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type Trace, type Score, type ScoreSource } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { ScoresPreview } from "@/src/components/trace/ScoresPreview";
import { AnnotateDrawer } from "@/src/features/manual-scoring/components/AnnotateDrawer";

export const TracePreview = ({
  trace,
  observations,
  scores,
}: {
  trace: Trace & { latency?: number };
  observations: ObservationReturnType[];
  scores: Score[];
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );

  const traceScores = scores.filter((s) => s.observationId === null);
  const traceScoresBySource = traceScores.reduce((acc, score) => {
    if (!acc.get(score.source)) {
      acc.set(score.source, []);
    }
    acc.get(score.source)?.push(score);
    return acc;
  }, new Map<ScoreSource, Score[]>());

  return (
    <Card className="col-span-2 flex max-h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-row justify-end gap-2">
        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="flex w-full justify-end border-b bg-background"
        >
          <TabsList className="bg-background py-0">
            <TabsTrigger
              value="preview"
              className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-primary-accent data-[state=active]:shadow-none"
            >
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="scores"
              className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-primary-accent data-[state=active]:shadow-none"
            >
              Scores
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex w-full flex-col overflow-y-auto">
        <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <span className="mr-2 rounded-sm bg-input p-1 text-xs">
                TRACE
              </span>
              <span>{trace.name}</span>
            </CardTitle>
            <CardDescription>
              {trace.timestamp.toLocaleString()}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              {!!trace.latency && (
                <Badge variant="outline">
                  {formatIntervalSeconds(trace.latency)}
                </Badge>
              )}
              <TraceAggUsageBadge observations={observations} />
              {!!trace.release && (
                <Badge variant="outline">Release: {trace.release}</Badge>
              )}
              {!!trace.version && (
                <Badge variant="outline">Version: {trace.version}</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AnnotateDrawer
              projectId={trace.projectId}
              traceId={trace.id}
              scores={scores}
            />
            <NewDatasetItemFromTrace
              traceId={trace.id}
              projectId={trace.projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {selectedTab === "preview" && (
            <>
              <IOPreview
                key={trace.id + "-io"}
                input={trace.input ?? undefined}
                output={trace.output ?? undefined}
              />
              <JSONView
                key={trace.id + "-metadata"}
                title="Metadata"
                json={trace.metadata}
              />
              <ScoresPreview itemScoresBySource={traceScoresBySource} />
            </>
          )}
          {selectedTab === "scores" && (
            <ScoresTable
              projectId={trace.projectId}
              omittedFilter={["Trace ID"]}
              traceId={trace.id}
              hiddenColumns={["traceName", "jobConfigurationId", "userId"]}
              tableColumnVisibilityName="scoresColumnVisibilityTracePreview"
            />
          )}
        </CardContent>
        <CardFooter></CardFooter>
      </div>
    </Card>
  );
};
