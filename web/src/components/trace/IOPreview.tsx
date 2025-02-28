import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { z } from "zod";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Fragment } from "react";
import { StringOrMarkdownSchema } from "@/src/components/schemas/MarkdownSchema";
import {
  ChatMlArraySchema,
  type ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { SubHeaderLabel } from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const IOPreview: React.FC<{
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  isLoading?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  currentView?: "pretty" | "json";
  setIsPrettyViewAvailable?: (value: boolean) => void;
}> = ({
  isLoading = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  currentView,
  ...props
}) => {
  const [localCurrentView, setLocalCurrentView] = useState<"pretty" | "json">(
    "pretty",
  );
  const selectedView = currentView ?? localCurrentView;
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
    : (props.output ?? null);

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

  const inMarkdown = StringOrMarkdownSchema.safeParse(input);
  const outMarkdown = StringOrMarkdownSchema.safeParse(output);

  const isPrettyViewAvailable =
    inChatMlArray.success || inMarkdown.success || outMarkdown.success;

  useEffect(() => {
    props.setIsPrettyViewAvailable?.(isPrettyViewAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrettyViewAvailable]);

  // If there are additional input fields beyond the messages, render them
  const additionalInput =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input as object).filter(([key]) => key !== "messages"),
        )
      : undefined;

  // default I/O
  return (
    <>
      {isPrettyViewAvailable && !currentView ? (
        <div className="flex w-full flex-row justify-start">
          <Tabs
            className="h-fit py-0.5"
            value={selectedView}
            onValueChange={(value) => {
              capture("trace_detail:io_mode_switch", { view: value });
              setLocalCurrentView(value as "pretty" | "json");
            }}
          >
            <TabsList>
              <TabsTrigger value="pretty" className="h-fit text-xs">
                Formatted
              </TabsTrigger>
              <TabsTrigger value="json" className="h-fit text-xs">
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {isPrettyViewAvailable && selectedView === "pretty" ? (
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
                      {
                        role: "assistant",
                        ...(typeof outputClean === "string"
                          ? { content: outputClean }
                          : { json: outputClean }),
                      } as ChatMlMessageSchema,
                    ]),
              ]}
              shouldRenderMarkdown
              additionalInput={
                Object.keys(additionalInput ?? {}).length > 0
                  ? additionalInput
                  : undefined
              }
              media={media ?? []}
            />
          ) : (
            <>
              {!(hideIfNull && !input) && !hideInput ? (
                <MarkdownJsonView
                  title="Input"
                  content={input}
                  media={media?.filter((m) => m.field === "input") ?? []}
                />
              ) : null}
              {!(hideIfNull && !output) && !hideOutput ? (
                <MarkdownJsonView
                  title="Output"
                  content={output}
                  customCodeHeaderClassName="bg-secondary"
                  media={media?.filter((m) => m.field === "output") ?? []}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}
      {selectedView === "json" || !isPrettyViewAvailable ? (
        <>
          {!(hideIfNull && !input) && !hideInput ? (
            <JSONView
              title="Input"
              json={input ?? null}
              isLoading={isLoading}
              media={media?.filter((m) => m.field === "input") ?? []}
            />
          ) : null}
          {!(hideIfNull && !output) && !hideOutput ? (
            <JSONView
              title="Output"
              json={outputClean}
              isLoading={isLoading}
              media={media?.filter((m) => m.field === "output") ?? []}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
};

export const OpenAiMessageView: React.FC<{
  messages: z.infer<typeof ChatMlArraySchema>;
  title?: string;
  shouldRenderMarkdown?: boolean;
  collapseLongHistory?: boolean;
  media?: MediaReturnType[];
  additionalInput?: Record<string, unknown>;
}> = ({
  title,
  messages,
  shouldRenderMarkdown = false,
  media,
  collapseLongHistory = true,
  additionalInput,
}) => {
  const COLLAPSE_THRESHOLD = 3;
  const [isCollapsed, setCollapsed] = useState(
    collapseLongHistory && messages.length > COLLAPSE_THRESHOLD ? true : null,
  );

  return (
    <div className="flex max-h-full min-h-0 flex-col gap-2">
      {title && <SubHeaderLabel title={title} className="mt-1" />}
      <div className="flex max-h-full min-h-0 flex-col gap-2">
        <div className="flex flex-col gap-2">
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
                {(!!message.content || !!message.audio) &&
                  (shouldRenderMarkdown ? (
                    <MarkdownJsonView
                      title={message.name ?? message.role}
                      content={message.content}
                      className={cn(!!message.json && "rounded-b-none")}
                      customCodeHeaderClassName={cn(
                        message.role === "assistant" && "bg-secondary",
                        message.role === "system" && "bg-primary-foreground",
                      )}
                      audio={message.audio}
                    />
                  ) : (
                    <JSONView
                      title={message.name ?? message.role}
                      json={message.content}
                      className={cn(!!message.json && "rounded-b-none")}
                    />
                  ))}
                {!!message.json && (
                  <JSONView
                    title={
                      message.content
                        ? undefined
                        : (message.name ?? message.role)
                    }
                    json={message.json}
                    className={cn(
                      !!message.content && "rounded-t-none border-t-0",
                    )}
                  />
                )}
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
        {additionalInput && (
          <div className="p-3 pt-1">
            <JSONView title="Additional Input" json={additionalInput} />
          </div>
        )}
        {media && media.length > 0 && (
          <>
            <div className="mx-3 border-t px-2 py-1 text-xs text-muted-foreground">
              Media
            </div>
            <div className="flex flex-wrap gap-2 p-4 pt-1">
              {media.map((m) => (
                <LangfuseMediaView
                  mediaAPIReturnValue={m}
                  asFileIcon={true}
                  key={m.mediaId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
