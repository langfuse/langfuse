import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type ScoreSource, type Score } from "@langfuse/shared";
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
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";

export const ObservationPreview = (props: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: Score[];
  currentObservationId: string;
  traceId: string;
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );

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

  const observationScores = props.scores.filter(
    (s) => s.observationId === preloadedObservation.id,
  );
  const observationScoresBySource = observationScores.reduce((acc, score) => {
    if (!acc.get(score.source)) {
      acc.set(score.source, []);
    }
    acc.get(score.source)?.push(score);
    return acc;
  }, new Map<ScoreSource, Score[]>());

  return (
    <Card className="flex-1">
      <div className="flex justify-end border-b">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="bg-white py-0">
            <TabsTrigger
              value="preview"
              className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:shadow-none"
            >
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="scores"
              className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:shadow-none"
            >
              Scores
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
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
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {selectedTab === "preview" && (
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
            {Boolean(observationScores.length) && (
              <div className="flex flex-col gap-2 rounded-md border py-2">
                <span className="border-b px-3 text-xs font-semibold">
                  Scores
                </span>
                <div
                  className={`grid grid-flow-col grid-rows-${observationScoresBySource.size} gap-2 overflow-x-auto`}
                >
                  {Array.from(observationScoresBySource).map(
                    ([source, scores]) => (
                      <div
                        key={source}
                        className="flex flex-row px-3 align-middle text-xs"
                      >
                        <span className="min-w-16 p-1 font-medium">
                          {source}
                        </span>
                        {scores.map((score) => (
                          <div
                            key={score.id}
                            className="ml-3 flex max-w-fit flex-row gap-1 whitespace-nowrap rounded-sm bg-secondary p-1 px-3"
                          >
                            <span className="font-medium">{`${score.name}:`}</span>
                            <span>{score.value.toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {selectedTab === "scores" && (
          <ScoresTable
            projectId={props.projectId}
            omittedFilter={["Observation ID"]}
            observationId={preloadedObservation.id}
            hiddenColumns={[
              "traceId",
              "observationId",
              "traceName",
              "jobConfigurationId",
            ]}
          />
        )}
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
