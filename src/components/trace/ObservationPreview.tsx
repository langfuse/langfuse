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
import { z } from "zod";
import { deepParseJson } from "@/src/utils/json";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

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
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ObservationIO
          key={preloadedObservation.id + "-input"}
          observationType={preloadedObservation.type}
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

const ObservationIO: React.FC<{
  observationType: string;
  input?: unknown;
  output?: unknown;
  isLoading: boolean;
}> = ({ isLoading, ...props }) => {
  const [currentView, setCurrentView] = useState<"pretty" | "json">("pretty");

  const input = deepParseJson(props.input);
  const output = deepParseJson(props.output);

  // parse old completions: { completion: string } -> string
  const outLegacyCompletionSchema = z
    .object({
      completion: z.string(),
    })
    .refine((value) => Object.keys(value).length === 1);
  const outLegacyCompletionSchemaParsed =
    outLegacyCompletionSchema.safeParse(output);
  const outputClean = outLegacyCompletionSchemaParsed.success
    ? outLegacyCompletionSchemaParsed.data
    : props.output ?? null;

  // OpenAI messages
  let inOpenAiMessageArray = OpenAiMessageArraySchema.safeParse(input);
  if (!inOpenAiMessageArray.success) {
    // check if input is an array of length 1 including an array of OpenAiMessageSchema
    // this is the case for some integrations
    const inputArray = z.array(OpenAiMessageArraySchema).safeParse(input);
    if (inputArray.success && inputArray.data.length === 1) {
      inOpenAiMessageArray = OpenAiMessageArraySchema.safeParse(
        inputArray.data[0],
      );
    }
  }
  const outOpenAiMessage = OpenAiMessageSchema.safeParse(output);

  // Pretty view available
  const isPrettyViewAvailable = inOpenAiMessageArray.success;

  // default I/O
  return (
    <>
      {isPrettyViewAvailable ? (
        <Tabs
          value={currentView}
          onValueChange={(v) => setCurrentView(v as "pretty" | "json")}
        >
          <TabsList>
            <TabsTrigger value="pretty">Pretty ✨</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {isPrettyViewAvailable && currentView === "pretty" ? (
        inOpenAiMessageArray.success ? (
          <OpenAiMessageView
            messages={inOpenAiMessageArray.data.concat(
              outOpenAiMessage.success
                ? {
                    ...outOpenAiMessage.data,
                    role: outOpenAiMessage.data.role ?? "assistant",
                  }
                : {
                    role: "assistant",
                    content: JSON.stringify(outputClean) ?? null,
                  },
            )}
          />
        ) : null
      ) : null}
      {currentView === "json" || !isPrettyViewAvailable ? (
        <>
          <JSONView
            title="Input"
            json={input ?? null}
            isLoading={isLoading}
            className="flex-1"
          />
          <JSONView
            title="Output"
            json={outputClean}
            isLoading={isLoading}
            className="flex-1"
          />
        </>
      ) : null}
    </>
  );
};

const OpenAiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]).optional(),
    content: z.string().nullable(),
  })
  .refine((value) => value.content !== null || value.role !== undefined);

const OpenAiMessageArraySchema = z.array(OpenAiMessageSchema).min(1);

const OpenAiMessageView: React.FC<{
  messages: z.infer<typeof OpenAiMessageArraySchema>;
}> = ({ messages }) => {
  const COLLAPSE_THRESHOLD = 3;
  const [isCollapsed, setCollapsed] = useState(
    messages.length > COLLAPSE_THRESHOLD ? true : null,
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      {messages
        .filter(
          (_, i) =>
            // show all if not collapsed or null; show first and last n if collapsed
            !isCollapsed || i == 0 || i > messages.length - COLLAPSE_THRESHOLD,
        )
        .map((message, index) => (
          <>
            <JSONView
              title={message.role}
              json={message.content}
              key={index}
              className={cn(
                message.role === "system" && "bg-gray-100",
                message.role === "assistant" && "bg-green-50",
              )}
            />
            {isCollapsed !== null && index === 0 ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setCollapsed((v) => !v)}
              >
                {isCollapsed
                  ? `Show ${messages.length - COLLAPSE_THRESHOLD} more ...`
                  : "Hide history"}
              </Button>
            ) : null}
          </>
        ))}
    </div>
  );
};
