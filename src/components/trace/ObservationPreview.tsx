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
import { ManualScoreButton } from "@/src/features/manual-scoring/components";
import { NewDatasetItemFromObservationButton } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";

export const ObservationPreview = (props: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: Score[];
  currentObservationId: string;
}) => {
  const observationWithInputAndOutput = api.observations.byId.useQuery(
    props.currentObservationId,
  );

  const preloadedObservation = props.observations.find(
    (o) => o.id === props.currentObservationId,
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
            {preloadedObservation.endTime ? (
              <Badge variant="outline">
                {`${(
                  (preloadedObservation.endTime.getTime() -
                    preloadedObservation.startTime.getTime()) /
                  1000
                ).toFixed(2)} sec`}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {preloadedObservation.promptTokens} prompt →{" "}
              {preloadedObservation.completionTokens} completion (∑{" "}
              {preloadedObservation.totalTokens})
            </Badge>
            {preloadedObservation.version ? (
              <Badge variant="outline">
                Version: {preloadedObservation.version}
              </Badge>
            ) : undefined}
            {preloadedObservation.model ? (
              <Badge variant="outline">{preloadedObservation.model}</Badge>
            ) : null}
            {preloadedObservation.price ? (
              <Badge variant="outline">
                {preloadedObservation.price.toString()} USD
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
        <div className="flex gap-2">
          <ManualScoreButton
            projectId={props.projectId}
            traceId={preloadedObservation.traceId}
            observationId={preloadedObservation.id}
            scores={props.scores}
          />
          {observationWithInputAndOutput.data ? (
            <NewDatasetItemFromObservationButton
              observationId={preloadedObservation.id}
              projectId={props.projectId}
              observationInput={observationWithInputAndOutput.data.input}
              observationOutput={observationWithInputAndOutput.data.output}
              key={preloadedObservation.id}
            />
          ) : (
            <div>Loading ...</div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <JSONView
          key={preloadedObservation.id + "-input"}
          title={
            preloadedObservation.type === "GENERATION" ? "Prompt" : "Input"
          }
          json={observationWithInputAndOutput.data?.input ?? undefined}
          isLoading={observationWithInputAndOutput.isLoading}
        />
        <JSONView
          key={preloadedObservation.id + "-output"}
          title={
            preloadedObservation.type === "GENERATION" ? "Completion" : "Output"
          }
          json={observationWithInputAndOutput.data?.output ?? undefined}
          isLoading={observationWithInputAndOutput.isLoading}
        />

        <JSONView
          key={preloadedObservation.id + "-status"}
          title="Status Message"
          json={preloadedObservation.statusMessage}
        />
        <JSONView
          key={preloadedObservation.id + "-metadata"}
          title="Metadata"
          json={preloadedObservation.metadata}
        />

        {props.scores.find(
          (s) => s.observationId === preloadedObservation.id,
        ) ? (
          <div className="flex flex-col gap-2">
            <h3>Scores</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Timestamp</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.scores
                  .filter((s) => s.observationId === preloadedObservation.id)
                  .map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        {s.timestamp.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{s.name}</TableCell>
                      <TableCell className="text-right text-xs">
                        {s.value}
                      </TableCell>
                      <TableCell className="text-xs">{s.comment}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
