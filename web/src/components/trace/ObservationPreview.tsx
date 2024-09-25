import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type APIScore, type ScoreSource } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
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
import { ScoresPreview } from "@/src/components/trace/ScoresPreview";
import { JumpToPlaygroundButton } from "@/src/ee/features/playground/page/components/JumpToPlaygroundButton";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { AddTraceToButton } from "@/src/components/trace/AddTraceToButton";
import { cn } from "@/src/utils/tailwind";

export const ObservationPreview = ({
  observations,
  projectId,
  scores,
  currentObservationId,
  traceId,
  commentCounts,
  viewType = "detailed",
  className,
}: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: APIScore[];
  currentObservationId: string;
  traceId: string;
  commentCounts?: Map<string, number>;
  viewType?: "focused" | "detailed";
  className?: string;
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  const observationWithInputAndOutput = api.observations.byId.useQuery({
    observationId: currentObservationId,
    traceId: traceId,
    projectId: projectId,
  });

  const preloadedObservation = observations.find(
    (o) => o.id === currentObservationId,
  );

  const totalCost = calculateDisplayTotalCost(
    preloadedObservation ? [preloadedObservation] : [],
  );

  if (!preloadedObservation) return <div className="flex-1">Not found</div>;

  const observationScores = scores.filter(
    (s) => s.observationId === preloadedObservation.id,
  );
  const observationScoresBySource = observationScores.reduce((acc, score) => {
    if (!acc.get(score.source)) {
      acc.set(score.source, []);
    }
    acc.get(score.source)?.push(score);
    return acc;
  }, new Map<ScoreSource, APIScore[]>());

  return (
    <Card
      className={cn(
        "col-span-2 flex max-h-full flex-col overflow-hidden",
        className,
      )}
    >
      {viewType === "detailed" && (
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
      )}
      <div className="flex w-full flex-col overflow-y-auto">
        <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <span className="mr-2 rounded-sm bg-input p-1 text-xs">
                {preloadedObservation.type}
              </span>
              <span>{preloadedObservation.name}</span>
            </CardTitle>
            <CardDescription className="flex gap-2">
              {preloadedObservation.startTime.toLocaleString()}
            </CardDescription>
            {viewType === "detailed" && (
              <div className="flex flex-wrap gap-2">
                {preloadedObservation.promptId ? (
                  <PromptBadge
                    promptId={preloadedObservation.promptId}
                    projectId={preloadedObservation.projectId}
                  />
                ) : undefined}
                {preloadedObservation.timeToFirstToken ? (
                  <Badge variant="outline">
                    Time to first token:{" "}
                    {formatIntervalSeconds(
                      preloadedObservation.timeToFirstToken,
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
                          {key}:{" "}
                          {Object.prototype.toString.call(value) ===
                          "[object Object]"
                            ? JSON.stringify(value)
                            : value?.toString()}
                        </Badge>
                      ))
                  : null}
              </div>
            )}
          </div>
          {viewType === "detailed" && (
            <div className="flex flex-wrap gap-2">
              <CommentDrawerButton
                projectId={preloadedObservation.projectId}
                objectId={preloadedObservation.id}
                objectType="OBSERVATION"
                count={commentCounts?.get(preloadedObservation.id)}
              />
              <AnnotateDrawer
                projectId={projectId}
                traceId={traceId}
                observationId={preloadedObservation.id}
                scores={scores}
                emptySelectedConfigIds={emptySelectedConfigIds}
                setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                type="observation"
                key={"annotation-drawer" + preloadedObservation.id}
              />
              {observationWithInputAndOutput.data?.type === "GENERATION" && (
                <JumpToPlaygroundButton
                  source="generation"
                  generation={observationWithInputAndOutput.data}
                  analyticsEventName="trace_detail:test_in_playground_button_click"
                />
              )}
              {observationWithInputAndOutput.data ? (
                <AddTraceToButton
                  traceId={preloadedObservation.traceId}
                  observationId={preloadedObservation.id}
                  projectId={projectId}
                  input={observationWithInputAndOutput.data.input}
                  output={observationWithInputAndOutput.data.output}
                  metadata={preloadedObservation.metadata}
                  key={preloadedObservation.id}
                />
              ) : null}
            </div>
          )}
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
              {viewType === "detailed" && (
                <ScoresPreview itemScoresBySource={observationScoresBySource} />
              )}
            </>
          )}
          {selectedTab === "scores" && (
            <ScoresTable
              projectId={projectId}
              omittedFilter={["Observation ID"]}
              observationId={preloadedObservation.id}
              hiddenColumns={[
                "traceId",
                "observationId",
                "traceName",
                "jobConfigurationId",
                "userId",
              ]}
              localStorageSuffix="ObservationPreview"
            />
          )}
        </CardContent>
      </div>
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
      href={`/project/${props.projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`}
    >
      <Badge>
        Prompt: {prompt.data.name}
        {" - v"}
        {prompt.data.version}
      </Badge>
    </Link>
  );
};
