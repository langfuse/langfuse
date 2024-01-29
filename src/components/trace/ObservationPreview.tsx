import { JSONView } from "@/src/components/ui/code";
import { type Score } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { NewDatasetItemFromObservationButton } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatInterval } from "@/src/utils/dates";
import { ExpertScoreButton } from "@/src/features/expert-scoring/components";
import Link from "next/link";
import Header from "@/src/components/layouts/header";
import { usdFormatter } from "@/src/utils/numbers";

export const ObservationPreview = (props: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: Score[];
  currentObservationId: string;
  traceId: string;
}) => {
  const observationWithInputAndOutput = api.observations.byId.useQuery({
    observationId: props.currentObservationId,
    traceId: props.traceId,
  });

  const preloadedObservation = props.observations.find(
    (o) => o.id === props.currentObservationId,
  );

  const scores = props.scores.filter(
    (s) => s.observationId === props.currentObservationId,
  );

  if (!preloadedObservation) return <div className="flex-1">Not found</div>;
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
                {formatInterval(
                  (preloadedObservation.completionStartTime.getTime() -
                    preloadedObservation.startTime.getTime()) /
                    1000,
                )}
              </Badge>
            ) : null}
            {preloadedObservation.endTime ? (
              <Badge variant="outline">
                Latency:{" "}
                {formatInterval(
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
            {preloadedObservation.calculatedTotalCost ? (
              <Badge variant="outline">
                {usdFormatter(
                  preloadedObservation.calculatedTotalCost.toNumber(),
                )}
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
        <div className="flex items-start gap-2">
          {observationWithInputAndOutput.data ? (
            <NewDatasetItemFromObservationButton
              observationId={preloadedObservation.id}
              projectId={props.projectId}
              observationInput={observationWithInputAndOutput.data.input}
              observationOutput={observationWithInputAndOutput.data.output}
              key={preloadedObservation.id}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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

        {preloadedObservation.metadata ? (
          <JSONView
            key={preloadedObservation.id + "-metadata"}
            title="Metadata"
            json={preloadedObservation.metadata}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <Header
            title="Scores"
            level="h3"
            actionButtons={
              <ExpertScoreButton
                projectId={props.projectId}
                traceId={preloadedObservation.traceId}
                observationId={preloadedObservation.id}
                scores={props.scores}
              />
            }
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Timestamp</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.length > 0 ? (
                scores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {s.timestamp.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{s.name}</TableCell>
                    <TableCell className="text-xs">{s.type}</TableCell>
                    <TableCell className="text-right text-xs">
                      {s.value}
                    </TableCell>
                    <TableCell className="text-xs">{s.comment}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs">
                    No scores
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
