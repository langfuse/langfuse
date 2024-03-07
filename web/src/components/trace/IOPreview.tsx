import { JSONView } from "@/src/components/ui/code";
import { z } from "zod";
import { deepParseJson } from "@/src/utils/json";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Fragment } from "react";

export const IOPreview: React.FC<{
  input?: unknown;
  output?: unknown;
  isLoading?: boolean;
  hideIfNull?: boolean;
}> = ({ isLoading = false, hideIfNull = false, ...props }) => {
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
    // e.g. [[OpenAiMessageSchema, ...]]
    const inputArray = z.array(OpenAiMessageArraySchema).safeParse(input);
    if (inputArray.success && inputArray.data.length === 1) {
      inOpenAiMessageArray = OpenAiMessageArraySchema.safeParse(
        inputArray.data[0],
      );
    } else {
      // check if input is an object with a messages key
      // this is the case for some integrations
      // e.g. { messages: [OpenAiMessageSchema, ...] }
      const inputObject = z
        .object({
          messages: OpenAiMessageArraySchema,
        })
        .safeParse(input);

      if (inputObject.success) {
        inOpenAiMessageArray = OpenAiMessageArraySchema.safeParse(
          inputObject.data.messages,
        );
      }
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
        <OpenAiMessageView
          messages={inOpenAiMessageArray.data.concat(
            outOpenAiMessage.success
              ? {
                  ...outOpenAiMessage.data,
                  role: outOpenAiMessage.data.role ?? "assistant",
                }
              : {
                  role: "assistant",
                  content: outputClean ? JSON.stringify(outputClean) : null,
                },
          )}
        />
      ) : null}
      {currentView === "json" || !isPrettyViewAvailable ? (
        <>
          {!(hideIfNull && !input) ? (
            <JSONView
              title="Input"
              json={input ?? null}
              isLoading={isLoading}
              className="flex-1"
            />
          ) : null}
          {!(hideIfNull && !output) ? (
            <JSONView
              title="Output"
              json={outputClean}
              isLoading={isLoading}
              className="flex-1 bg-green-50"
            />
          ) : null}
        </>
      ) : null}
    </>
  );
};

const OpenAiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "function"]).optional(),
    name: z.string().optional(),
    content: z
      .union([z.record(z.any()), z.record(z.any()).array(), z.string()])
      .nullable(),
    function_call: z
      .object({
        name: z.string(),
        arguments: z.record(z.any()),
      })
      .optional(),
  })
  .strict() // no additional properties
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
          <Fragment key={index}>
            <JSONView
              title={message.name ?? message.role}
              json={message.function_call ?? message.content}
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
          </Fragment>
        ))}
    </div>
  );
};
