import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type Trace, type Score } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import { ManualScoreButton } from "@/src/features/manual-scoring/components/ManualScoreButton";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useState } from "react";
import { ScoresTablePreview } from "@/src/components/trace/ScoresTablePreview";

export const TracePreview = ({
  trace,
  observations,
  scores,
}: {
  trace: Trace & { latency?: number };
  observations: ObservationReturnType[];
  scores: Score[];
}) => {
  const [selectedTab, setSelectedTab] = useState("preview");
  const isScoreAttached = scores.some((s) => s.observationId === null);

  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>
            <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
              TRACE
            </span>
            <span>{trace.name}</span>
          </CardTitle>
          <CardDescription>{trace.timestamp.toLocaleString()}</CardDescription>
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
          <ManualScoreButton
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
          {isScoreAttached && (
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="scores">Scores</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
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
          </>
        )}
        {selectedTab === "scores" && isScoreAttached ? (
          <ScoresTablePreview
            scores={scores.filter((s) => s.observationId === null)}
          />
        ) : null}
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
};
