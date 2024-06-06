import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { z } from "zod";
import { deepParseJson } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Fragment } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const IOPreview: React.FC<{
  input?: unknown;
  output?: unknown;
  isLoading?: boolean;
  hideIfNull?: boolean;
}> = ({ isLoading = false, hideIfNull = false, ...props }) => {
  const [currentView, setCurrentView] = useState<"pretty" | "json">("pretty");
  const capture = usePostHogClientCapture();
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

  // ChatML format
  let inChatMlArray = ChatMlArraySchema.safeParse(input);
  if (!inChatMlArray.success) {
    // check if input is an array of length 1 including an array of ChatMlMessageSchema
    // this is the case for some integrations
    // e.g. [[ChatMlMessageSchema, ...]]
    const inputArray = z.array(ChatMlArraySchema).safeParse(input);
    if (inputArray.success && inputArray.data.length === 1) {
      inChatMlArray = ChatMlArraySchema.safeParse(inputArray.data[0]);
    } else {
      // check if input is an object with a messages key
      // this is the case for some integrations
      // e.g. { messages: [ChatMlMessageSchema, ...] }
      const inputObject = z
        .object({
          messages: ChatMlArraySchema,
        })
        .safeParse(input);

      if (inputObject.success) {
        inChatMlArray = ChatMlArraySchema.safeParse(inputObject.data.messages);
      }
    }
  }
  const outChatMlArray = ChatMlArraySchema.safeParse(
    Array.isArray(output) ? output : [output],
  );

  // Pretty view available
  const isPrettyViewAvailable = inChatMlArray.success;

  // default I/O
  return (
    <>
      {isPrettyViewAvailable ? (
        <Tabs
          value={currentView}
          onValueChange={(v) => {
            setCurrentView(v as "pretty" | "json"),
              capture("trace_detail:io_mode_switch", { view: v });
          }}
        >
          <TabsList>
            <TabsTrigger value="pretty">Pretty ✨</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {isPrettyViewAvailable && currentView === "pretty" ? (
        <OpenAiMessageView
          messages={[
            ...inChatMlArray.data,
            ...(outChatMlArray.success
              ? outChatMlArray.data.map((m) => ({
                  ...m,
                  role: m.role ?? "assistant",
                }))
              : [
                  ChatMlMessageSchema.parse({
                    role: "assistant",
                    content: outputClean ? JSON.stringify(outputClean) : null,
                  }),
                ]),
          ]}
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
              className="flex-1 bg-accent-light-green dark:border-accent-dark-green"
            />
          ) : null}
        </>
      ) : null}
    </>
  );
};

const ChatMlMessageSchema = z
  .object({
    role: z
      .enum(["system", "user", "assistant", "function", "tool"])
      .optional(),
    name: z.string().optional(),
    content: z
      .union([z.record(z.any()), z.string(), z.array(z.any())])
      .nullish(),
    additional_kwargs: z.record(z.any()).optional(),
  })
  .passthrough()
  .refine((value) => value.content !== null || value.role !== undefined)
  .transform(({ additional_kwargs, ...other }) => ({
    ...other,
    ...additional_kwargs,
  }))
  .transform(({ role, name, content, ...other }) => ({
    role,
    name,
    content,
    json: Object.keys(other).length === 0 ? undefined : other,
  }));
export const ChatMlArraySchema = z.array(ChatMlMessageSchema).min(1);

export const OpenAiMessageView: React.FC<{
  title?: string;
  messages: z.infer<typeof ChatMlArraySchema>;
}> = ({ title, messages }) => {
  const COLLAPSE_THRESHOLD = 3;
  const [isCollapsed, setCollapsed] = useState(
    messages.length > COLLAPSE_THRESHOLD ? true : null,
  );

  const transformedMessages = messages;
  // const transformedMessages = messages.map(
  //   ({ role, name, content, ...rest }) => ({
  //     role,
  //     name,
  //     content,
  //     json: rest,
  //   }),
  // );

  return (
    <div className="rounded-md border">
      {title && (
        <div className="border-b px-3 py-1 text-xs font-medium">{title}</div>
      )}
      <div className="flex flex-col gap-2 p-3">
        {transformedMessages
          .filter(
            (_, i) =>
              // show all if not collapsed or null; show first and last n if collapsed
              !isCollapsed ||
              i == 0 ||
              i > messages.length - COLLAPSE_THRESHOLD,
          )
          .map((message, index) => (
            <Fragment key={index}>
              <div>
                {!!message.content && (
                  <JSONView
                    title={message.name ?? message.role}
                    json={message.content}
                    className={cn(
                      "bg-muted",
                      message.role === "system" && "bg-primary-foreground",
                      message.role === "assistant" &&
                        "bg-accent-light-green dark:border-accent-dark-green",
                      message.role === "user" && "bg-background",
                      !!message.json && "rounded-b-none",
                    )}
                  />
                )}
                {!!message.json && (
                  <JSONView
                    title={
                      message.content ? undefined : message.name ?? message.role
                    }
                    json={message.json}
                    className={cn(
                      "bg-muted",
                      message.role === "system" && "bg-primary-foreground",
                      message.role === "assistant" &&
                        "bg-accent-light-green dark:border-accent-dark-green",
                      message.role === "user" && "bg-foreground",
                      !!message.content && "rounded-t-none border-t-0",
                    )}
                  />
                )}
              </div>
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
    </div>
  );
};
