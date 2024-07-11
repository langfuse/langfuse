import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { z } from "zod";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Fragment } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { MarkdownSchema } from "@/src/components/schemas/MarkdownSchema";
import {
  ChatMlArraySchema,
  ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";

function MarkdownOrJsonView(props: {
  text?: unknown;
  title?: string;
  className?: string;
  isMarkdown?: boolean;
}) {
  return props.isMarkdown && typeof props.text === "string" ? (
    <MarkdownView
      markdown={props.text}
      title={props.title}
      className={props.className}
    />
  ) : (
    <JSONView
      json={props.text}
      title={props.title}
      className={props.className}
    />
  );
}

export const IOPreview: React.FC<{
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
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

  const inMarkdown = MarkdownSchema.safeParse(input);
  const outMarkdown = MarkdownSchema.safeParse(output);

  const isPrettyViewAvailable =
    inChatMlArray.success || inMarkdown.success || outMarkdown.success;

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
        <>
          {inChatMlArray.success ? (
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
                        content: outputClean,
                      }),
                    ]),
              ]}
            />
          ) : (
            <>
              {!(hideIfNull && !input) ? (
                <MarkdownOrJsonView
                  title="Input"
                  text={input}
                  isMarkdown={inMarkdown.success}
                />
              ) : null}
              {!(hideIfNull && !output) ? (
                <MarkdownOrJsonView
                  title="Output"
                  text={output}
                  isMarkdown={outMarkdown.success}
                  className="bg-accent-light-green dark:border-accent-dark-green"
                />
              ) : null}
            </>
          )}
        </>
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

export const OpenAiMessageView: React.FC<{
  title?: string;
  messages: z.infer<typeof ChatMlArraySchema>;
}> = ({ title, messages }) => {
  const COLLAPSE_THRESHOLD = 3; // ignore for markdown rendering
  const [isCollapsed, setCollapsed] = useState(
    messages.length > COLLAPSE_THRESHOLD ? true : null,
  );

  return (
    <div className="rounded-md border">
      {title && (
        <div className="border-b px-3 py-1 text-xs font-medium">{title}</div>
      )}
      <div className="flex flex-col gap-2 p-3">
        {messages
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
                  <MarkdownOrJsonView
                    title={message.name ?? message.role}
                    text={message.content}
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
                      message.role === "user" && "bg-background",
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
