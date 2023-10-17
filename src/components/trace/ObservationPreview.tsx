import { JSONView } from "@/src/components/ui/code";
import { type Observation, type Score } from "@prisma/client";
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
import type Decimal from "decimal.js";
import { NewDatasetItemFromObservationButton } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";

export const ObservationPreview = (props: {
  observations: Array<Observation & { traceId: string } & { price?: Decimal }>;
  projectId: string;
  scores: Score[];
  currentObservationId: string | undefined;
}) => {
  const observation = props.observations.find(
    (o) => o.id === props.currentObservationId,
  );
  if (!observation) return <div className="flex-1">Not found</div>;
  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>
            <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
              {observation.type}
            </span>
            <span>{observation.name}</span>
          </CardTitle>
          <CardDescription className="flex gap-2">
            {observation.startTime.toLocaleString()}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            {observation.endTime ? (
              <Badge variant="outline">
                {`${(
                  (observation.endTime.getTime() -
                    observation.startTime.getTime()) /
                  1000
                ).toFixed(2)} sec`}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {observation.promptTokens} prompt → {observation.completionTokens}{" "}
              completion (∑ {observation.totalTokens})
            </Badge>
            {observation.version ? (
              <Badge variant="outline">Version: {observation.version}</Badge>
            ) : undefined}
            {observation.model ? (
              <Badge variant="outline">{observation.model}</Badge>
            ) : null}
            {observation.price ? (
              <Badge variant="outline">
                {observation.price.toString()} USD
              </Badge>
            ) : undefined}
            {observation.modelParameters &&
            typeof observation.modelParameters === "object"
              ? Object.entries(observation.modelParameters)
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
            traceId={observation.traceId}
            observationId={observation.id}
            scores={props.scores}
          />
          <NewDatasetItemFromObservationButton
            observationId={observation.id}
            projectId={props.projectId}
            observationInput={observation.input}
            observationOutput={observation.output}
            key={observation.id}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <JSONView
          key={observation.id + "-input"}
          title={observation.type === "GENERATION" ? "Prompt" : "Input"}
          json={observation.input}
        />
        <JSONView
          key={observation.id + "-output"}
          title={observation.type === "GENERATION" ? "Completion" : "Output"}
          json={observation.output}
        />
        <JSONView
          key={observation.id + "-status"}
          title="Status Message"
          json={observation.statusMessage}
        />
        <JSONView
          key={observation.id + "-metadata"}
          title="Metadata"
          json={observation.metadata}
        />
        {props.scores.find((s) => s.observationId === observation.id) ? (
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
                  .filter((s) => s.observationId === observation.id)
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
