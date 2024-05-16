import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type Score } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ManualScoreButton } from "@/src/features/manual-scoring/components/ManualScoreButton";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import Link from "next/link";
import { usdFormatter } from "@/src/utils/numbers";
import { calculateDisplayTotalCost } from "@/src/components/trace";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useEffect, useState } from "react";
import { ScoresTablePreview } from "@/src/components/trace/ScoresTablePreview";

export const ObservationPreview = (props: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: Score[];
  currentObservationId: string;
  traceId: string;
}) => {
  const [selectedTab, setSelectedTab] = useState("details");

  useEffect(() => {
    setSelectedTab("details");
  }, [props.currentObservationId]);

  const observationWithInputAndOutput = api.observations.byId.useQuery({
    observationId: props.currentObservationId,
    traceId: props.traceId,
  });

  const preloadedObservation = props.observations.find(
    (o) => o.id === props.currentObservationId,
  );

  const totalCost = calculateDisplayTotalCost(
    preloadedObservation ? [preloadedObservation] : [],
  );

  if (!preloadedObservation) return <div className="flex-1">Not found</div>;

  const isScoreAttached = props.scores.some(
    (s) => s.observationId === preloadedObservation.id,
  );

  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>
            <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
              {preloadedObservation.type}
            </span>
            <span>{preloadedObservation.name}</span>
          </CardTitle>
          <CardDescription className="flex gap-2">
            {preloadedObservation.startTime.toLocaleString()}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            {preloadedObservation.promptId ? (
              <PromptBadge
                promptId={preloadedObservation.promptId}
                projectId={preloadedObservation.projectId}
              />
            ) : undefined}
            {preloadedObservation.completionStartTime ? (
              <Badge variant="outline">
                Time to first token:{" "}
                {formatIntervalSeconds(
                  (preloadedObservation.completionStartTime.getTime() -
                    preloadedObservation.startTime.getTime()) /
                    1000,
                )}
              </Badge>
            ) : null}
            {preloadedObservation.endTime ? (
              <Badge variant="outline">
                Latency:{" "}
                {formatIntervalSeconds(
                  (preloadedObservation.endTime.getTime() -
                    preloadedObservation.startTime.getTime()) /
                    1000,
                )}
              </Badge>
            ) : null}
            {preloadedObservation.type === "GENERATION" && (
              <Badge variant="outline">
                {preloadedObservation.promptTokens} prompt →{" "}
                {preloadedObservation.completionTokens} completion (∑{" "}
                {preloadedObservation.totalTokens})
              </Badge>
            )}
            {preloadedObservation.version ? (
              <Badge variant="outline">
                Version: {preloadedObservation.version}
              </Badge>
            ) : undefined}
            {preloadedObservation.model ? (
              <Badge variant="outline">{preloadedObservation.model}</Badge>
            ) : null}
            {totalCost ? (
              <Badge variant="outline">
                {usdFormatter(totalCost.toNumber())}
              </Badge>
            ) : undefined}

            {preloadedObservation.modelParameters &&
            typeof preloadedObservation.modelParameters === "object"
              ? Object.entries(preloadedObservation.modelParameters)
                  .filter(Boolean)
                  .map(([key, value]) => (
                    <Badge variant="outline" key={key}>
                      {key}: {value?.toString()}
                    </Badge>
                  ))
              : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ManualScoreButton
            projectId={props.projectId}
            traceId={preloadedObservation.traceId}
            observationId={preloadedObservation.id}
            scores={props.scores}
          />
          {observationWithInputAndOutput.data ? (
            <NewDatasetItemFromTrace
              traceId={preloadedObservation.traceId}
              observationId={preloadedObservation.id}
              projectId={props.projectId}
              input={observationWithInputAndOutput.data.input}
              output={observationWithInputAndOutput.data.output}
              metadata={preloadedObservation.metadata}
              key={preloadedObservation.id}
            />
          ) : null}
          {isScoreAttached && (
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="scores">Scores</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {selectedTab === "details" && (
          <>
            <IOPreview
              key={preloadedObservation.id + "-input"}
              input={observationWithInputAndOutput.data?.input ?? undefined}
              output={observationWithInputAndOutput.data?.output ?? undefined}
              isLoading={observationWithInputAndOutput.isLoading}
            />
            {preloadedObservation.statusMessage ? (
              <JSONView
                key={preloadedObservation.id + "-status"}
                title="Status Message"
                json={preloadedObservation.statusMessage}
              />
            ) : null}
            {observationWithInputAndOutput.data?.metadata ? (
              <JSONView
                key={observationWithInputAndOutput.data.id + "-metadata"}
                title="Metadata"
                json={observationWithInputAndOutput.data.metadata}
              />
            ) : null}
          </>
        )}

        {selectedTab === "scores" && isScoreAttached ? (
          <ScoresTablePreview
            scores={props.scores.filter(
              (s) => s.observationId === preloadedObservation.id,
            )}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};

const PromptBadge = (props: { promptId: string; projectId: string }) => {
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  if (prompt.isLoading || !prompt.data) return null;
  return (
    <Link
      href={`/project/${props.projectId}/prompts/${prompt.data.name}?version=${prompt.data.version}`}
    >
      <Badge>
        Prompt: {prompt.data.name}
        {" - v"}
        {prompt.data.version}
      </Badge>
    </Link>
  );
};
