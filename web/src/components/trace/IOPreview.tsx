import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Fragment } from "react";
import type { z } from "zod/v4";
import type {
  ChatMlArraySchema,
  ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { SubHeaderLabel } from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import usePreserveRelativeScroll from "@/src/hooks/usePreserveRelativeScroll";
import { MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/utils/constants";
import {
  normalizeInput,
  normalizeOutput,
  combineInputOutputMessages,
  cleanLegacyOutput,
  extractAdditionalInput,
} from "@/src/utils/chatml";

export const IOPreview: React.FC<{
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  observationName?: string;
  isLoading?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  currentView?: "pretty" | "json";
  setIsPrettyViewAvailable?: (value: boolean) => void;
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}> = ({
  isLoading = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  currentView,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  setIsPrettyViewAvailable,
  ...props
}) => {
  const [localCurrentView, setLocalCurrentView] = useLocalStorage<
    "pretty" | "json"
  >("jsonViewPreference", "pretty");
  const selectedView = currentView ?? localCurrentView;
  const capture = usePostHogClientCapture();
  const input = deepParseJson(props.input);
  const output = deepParseJson(props.output);
  const metadata = deepParseJson(props.metadata);
  const [compensateScrollRef, startPreserveScroll] =
    usePreserveRelativeScroll<HTMLDivElement>([selectedView]);

  const { canDisplayAsChat, allMessages, additionalInput } = useMemo(() => {
    const ctx = { metadata, observationName: props.observationName };
    const inResult = normalizeInput(input, ctx);
    const outResult = normalizeOutput(output, ctx);
    const outputClean = cleanLegacyOutput(output, output);
    const messages = combineInputOutputMessages(
      inResult,
      outResult,
      outputClean,
    );

    return {
      // display as chat if normalization succeeded AND we have messages to show
      canDisplayAsChat:
        (inResult.success || outResult.success) && messages.length > 0,
      allMessages: messages,
      additionalInput: extractAdditionalInput(input),
    };
  }, [input, output, metadata, props.observationName]);

  // Pretty view is available for ChatML content OR any JSON content
  const isPrettyViewAvailable = true; // Always show the toggle, let individual components decide how to render

  useEffect(() => {
    setIsPrettyViewAvailable?.(isPrettyViewAvailable);
  }, [isPrettyViewAvailable, setIsPrettyViewAvailable]);

  // Don't render markdown if total content size exceeds limit
  const inputSize = JSON.stringify(input || {}).length;
  const outputSize = JSON.stringify(output || {}).length;
  const messagesSize = JSON.stringify(allMessages).length;
  const totalContentSize = inputSize + outputSize + messagesSize;

  const shouldRenderMarkdownSafely =
    totalContentSize <= MARKDOWN_RENDER_CHARACTER_LIMIT;

  // default I/O
  return (
    <>
      {isPrettyViewAvailable && !currentView ? (
        <div className="flex w-full flex-row justify-start">
          <Tabs
            ref={compensateScrollRef}
            className="h-fit py-0.5"
            value={selectedView}
            onValueChange={(value) => {
              startPreserveScroll();
              capture("trace_detail:io_mode_switch", { view: value });
              setLocalCurrentView(value as "pretty" | "json");
            }}
          >
            <TabsList className="h-fit p-0.5">
              <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                Formatted
              </TabsTrigger>
              <TabsTrigger value="json" className="h-fit px-1 text-xs">
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {/* Always render components to preserve state, just hide via CSS*/}
      {isPrettyViewAvailable ? (
        <>
          {/* Pretty view content */}
          <div
            style={{ display: selectedView === "pretty" ? "block" : "none" }}
          >
            {canDisplayAsChat ? (
              <OpenAiMessageView
                messages={allMessages}
                shouldRenderMarkdown={shouldRenderMarkdownSafely}
                additionalInput={
                  Object.keys(additionalInput ?? {}).length > 0
                    ? additionalInput
                    : undefined
                }
                media={media ?? []}
                currentView={selectedView}
              />
            ) : (
              <>
                {!(hideIfNull && !input) && !hideInput ? (
                  <PrettyJsonView
                    title="Input"
                    json={input ?? null}
                    isLoading={isLoading}
                    media={media?.filter((m) => m.field === "input") ?? []}
                    currentView={selectedView}
                    externalExpansionState={inputExpansionState}
                    onExternalExpansionChange={onInputExpansionChange}
                  />
                ) : null}
                {!(hideIfNull && !output) && !hideOutput ? (
                  <PrettyJsonView
                    title="Output"
                    json={output}
                    isLoading={isLoading}
                    media={media?.filter((m) => m.field === "output") ?? []}
                    currentView={selectedView}
                    externalExpansionState={outputExpansionState}
                    onExternalExpansionChange={onOutputExpansionChange}
                  />
                ) : null}
              </>
            )}
          </div>

          {/* JSON view content */}
          <div style={{ display: selectedView === "json" ? "block" : "none" }}>
            {!(hideIfNull && !input) && !hideInput ? (
              <PrettyJsonView
                title="Input"
                json={input ?? null}
                isLoading={isLoading}
                media={media?.filter((m) => m.field === "input") ?? []}
                currentView={selectedView}
                externalExpansionState={inputExpansionState}
                onExternalExpansionChange={onInputExpansionChange}
              />
            ) : null}
            {!(hideIfNull && !output) && !hideOutput ? (
              <PrettyJsonView
                title="Output"
                json={output}
                isLoading={isLoading}
                media={media?.filter((m) => m.field === "output") ?? []}
                currentView={selectedView}
                externalExpansionState={outputExpansionState}
                onExternalExpansionChange={onOutputExpansionChange}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          {!(hideIfNull && !input) && !hideInput ? (
            <PrettyJsonView
              title="Input"
              json={input ?? null}
              isLoading={isLoading}
              media={media?.filter((m) => m.field === "input") ?? []}
              currentView={selectedView}
              externalExpansionState={inputExpansionState}
              onExternalExpansionChange={onInputExpansionChange}
            />
          ) : null}
          {!(hideIfNull && !output) && !hideOutput ? (
            <PrettyJsonView
              title="Output"
              json={output}
              isLoading={isLoading}
              media={media?.filter((m) => m.field === "output") ?? []}
              currentView={selectedView}
              externalExpansionState={outputExpansionState}
              onExternalExpansionChange={onOutputExpansionChange}
            />
          ) : null}
        </>
      )}
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
  projectIdForPromptButtons?: string;
  currentView?: "pretty" | "json";
}> = ({
  title,
  messages,
  shouldRenderMarkdown = false,
  media,
  collapseLongHistory = true,
  additionalInput,
  projectIdForPromptButtons,
  currentView = "json",
}) => {
  const COLLAPSE_THRESHOLD = 3;
  const [isCollapsed, setCollapsed] = useState(
    collapseLongHistory && messages.length > COLLAPSE_THRESHOLD ? true : null,
  );

  const shouldRenderContent = (message: ChatMlMessageSchema) => {
    return message.content != null || !!message.audio;
  };

  const shouldRenderJson = (message: ChatMlMessageSchema) => {
    return !!message.json;
  };

  const isPlaceholderMessage = (message: ChatMlMessageSchema) => {
    return message.type === "placeholder";
  };

  const messagesToRender = useMemo(
    () =>
      messages.filter(
        (message) =>
          shouldRenderContent(message) ||
          shouldRenderJson(message) ||
          isPlaceholderMessage(message),
      ),
    [messages],
  );

  return (
    <div className="flex max-h-full min-h-0 flex-col gap-2">
      {title && <SubHeaderLabel title={title} className="mt-1" />}
      <div className="flex max-h-full min-h-0 flex-col gap-2">
        <div className="flex flex-col gap-2">
          {messagesToRender
            .filter(
              (_, i) =>
                // show all if not collapsed or null; show first and last n if collapsed
                !isCollapsed ||
                i == 0 ||
                i > messagesToRender.length - COLLAPSE_THRESHOLD,
            )
            .map((message, index) => (
              <Fragment key={index}>
                {isPlaceholderMessage(message) ? (
                  <>
                    <div
                      style={{
                        display: shouldRenderMarkdown ? "block" : "none",
                      }}
                    >
                      <MarkdownJsonView
                        title="Placeholder"
                        content={message.name || "Unnamed placeholder"}
                        customCodeHeaderClassName={cn("bg-primary-foreground")}
                      />
                    </div>
                    <div
                      style={{
                        display: shouldRenderMarkdown ? "none" : "block",
                      }}
                    >
                      <PrettyJsonView
                        title="Placeholder"
                        json={message.name || "Unnamed placeholder"}
                        projectIdForPromptButtons={projectIdForPromptButtons}
                        currentView={currentView}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {shouldRenderContent(message) && (
                      <>
                        <div
                          style={{
                            display: shouldRenderMarkdown ? "block" : "none",
                          }}
                        >
                          <MarkdownJsonView
                            title={message.name ?? message.role}
                            content={message.content || '""'}
                            className={cn(
                              !!message.json &&
                                !isPlaceholderMessage(message) &&
                                "rounded-b-none",
                            )}
                            customCodeHeaderClassName={cn(
                              message.role === "assistant" && "bg-secondary",
                              message.role === "system" &&
                                "bg-primary-foreground",
                            )}
                            audio={message.audio}
                          />
                        </div>
                        <div
                          style={{
                            display: shouldRenderMarkdown ? "none" : "block",
                          }}
                        >
                          <PrettyJsonView
                            title={message.name ?? message.role}
                            json={message.content}
                            projectIdForPromptButtons={
                              projectIdForPromptButtons
                            }
                            className={cn(
                              !!message.json &&
                                !isPlaceholderMessage(message) &&
                                "rounded-b-none",
                            )}
                            currentView={currentView}
                          />
                        </div>
                      </>
                    )}
                    {shouldRenderJson(message) &&
                      !isPlaceholderMessage(message) && (
                        <PrettyJsonView
                          title={
                            message.content
                              ? undefined
                              : (message.name ?? message.role)
                          }
                          json={message.json}
                          projectIdForPromptButtons={projectIdForPromptButtons}
                          className={cn(
                            !!message.content && "rounded-t-none border-t-0",
                          )}
                          currentView={shouldRenderMarkdown ? "pretty" : "json"}
                        />
                      )}
                  </>
                )}
                {isCollapsed !== null && index === 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setCollapsed((v) => !v)}
                  >
                    {isCollapsed
                      ? `Show ${messagesToRender.length - COLLAPSE_THRESHOLD} more ...`
                      : "Hide history"}
                  </Button>
                ) : null}
              </Fragment>
            ))}
        </div>
        {additionalInput && (
          <PrettyJsonView
            title="Additional Input"
            json={additionalInput}
            projectIdForPromptButtons={projectIdForPromptButtons}
            currentView={shouldRenderMarkdown ? "pretty" : "json"}
          />
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
