import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "../context";
import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";
import {
  BracesIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
} from "lucide-react";
import { ToolCallCard } from "@/src/components/ChatMessages/ToolCallCard";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { ThinkingBlock } from "@/src/features/traces";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { type PlaygroundRunResult } from "../types";
import { computeRunStats } from "../utils/runStats";

export const GenerationOutput = () => {
  const [isCopied, setIsCopied] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [isJson, setIsJson] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const {
    output,
    outputReasoning,
    outputJson,
    addMessage,
    outputToolCalls,
    scrollToMessage,
    runs,
  } = usePlaygroundContext();

  const isMultiRun = runs.length > 1;
  const [activeRunIndex, setActiveRunIndex] = useState(0);
  const isRunning = runs.some((run) => run.status === "running");

  // While executing, follow the most recently settled run so the carousel
  // shows progress without requiring interaction; once the batch finishes,
  // reset to the first run so review always starts from the beginning.
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (isRunning) {
      const lastSettled = runs.reduce(
        (latest, run, index) => (run.status !== "running" ? index : latest),
        0,
      );
      setActiveRunIndex(lastSettled);
    } else if (wasRunningRef.current) {
      setActiveRunIndex(0);
    }
    wasRunningRef.current = isRunning;
  }, [runs, isRunning]);

  // Copy and add-to-messages always act on what is visible: the active
  // carousel run during repeated submissions, the legacy single output
  // otherwise.
  const activeRun = isMultiRun
    ? runs[Math.min(activeRunIndex, runs.length - 1)]
    : undefined;
  const visibleContent = activeRun ? activeRun.content : output;
  const visibleToolCalls = activeRun ? activeRun.toolCalls : outputToolCalls;

  const handleCopy = () => {
    setIsCopied(true);
    const textToCopy = activeRun
      ? isJson
        ? JSON.stringify(
            {
              content: activeRun.content,
              ...(activeRun.toolCalls.length > 0
                ? { tool_calls: activeRun.toolCalls }
                : {}),
            },
            null,
            2,
          )
        : activeRun.content
      : isJson
        ? outputJson
        : output;
    copyTextToClipboard(textToCopy);
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleAddAssistantMessage = () => {
    setIsAdded(true);
    const newMessage =
      visibleToolCalls.length > 0
        ? addMessage({
            type: ChatMessageType.AssistantToolCall,
            role: ChatMessageRole.Assistant,
            content: visibleContent,
            toolCalls: visibleToolCalls,
          })
        : addMessage({
            type: ChatMessageType.AssistantText,
            role: ChatMessageRole.Assistant,
            content: visibleContent,
          });
    // Scroll the appended row into view without stealing focus: this is a
    // programmatic add from the Output panel, so unlike the Add-message button
    // path (focus=true) we shouldn't yank the caret into the new editor. For a
    // tool-call add, addMessage returns the last appended row (the final
    // ToolResult placeholder), so we reveal the newest content (LFE-6864).
    scrollToMessage(newMessage.id, false);
    setTimeout(() => setIsAdded(false), 1000);
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [output]);

  const checkIcon = <Check className="h-2 w-2" />;
  const copyIcon = <Copy className="h-2 w-2" />;
  const plusIcon = <Plus className="h-2 w-2" />;

  const copyButton =
    output || outputToolCalls.length || isMultiRun ? (
      <div className="absolute top-2 right-3 flex space-x-1 opacity-50">
        <Button
          size="icon"
          variant={isJson ? "default" : "secondary"}
          onClick={() => {
            setIsJson((prev) => !prev);
          }}
          title="Toggle Input/Output JSON"
        >
          <BracesIcon size={15} />
        </Button>

        <Button
          size="icon"
          variant="secondary"
          onClick={!isCopied ? handleCopy : undefined}
          title={isMultiRun ? "Copy active run" : "Copy output"}
        >
          {isCopied ? checkIcon : copyIcon}
        </Button>

        <Button
          className="flex items-center gap-1 p-0 px-1 whitespace-nowrap"
          variant="secondary"
          onClick={!isAdded ? handleAddAssistantMessage : undefined}
          title={
            isMultiRun
              ? "Add active run as assistant message"
              : "Add as assistant message"
          }
          disabled={isAdded}
        >
          {isAdded ? checkIcon : plusIcon}
          <span className="text-xs">Add to messages</span>
        </Button>
      </div>
    ) : null;

  return (
    <div className="relative h-full">
      <div
        className="bg-muted h-full overflow-auto rounded-lg"
        ref={scrollAreaRef}
      >
        <div className="bg-muted sticky top-0 z-10 p-3">
          <div className="flex w-full items-center">
            <p className="flex-1 text-xs font-bold">Output</p>
            {copyButton}
          </div>
        </div>
        <div className="px-4">
          {isMultiRun ? (
            <MultiRunOutput
              runs={runs}
              activeIndex={activeRunIndex}
              onNavigate={setActiveRunIndex}
            />
          ) : (
            <>
              {outputReasoning && !isJson && (
                <div className="-ml-1">
                  <ThinkingBlock content={outputReasoning} />
                </div>
              )}
              <pre className="text-xs wrap-break-word whitespace-break-spaces">
                {isJson ? outputJson : output}
              </pre>
              {outputToolCalls.length > 0
                ? outputToolCalls.map((toolCall) => (
                    <div className="mt-4" key={toolCall.id}>
                      <ToolCallCard toolCall={toolCall} />
                    </div>
                  ))
                : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Output panel for repeated ("Run xN") submissions: a carousel over the runs
 * (one run visible at a time, prev/next navigation) preceded by deterministic
 * consistency stats (counts, frequencies, and latency distribution only).
 * Navigation state lives in the parent so copy/add actions target the run
 * that is currently visible.
 */
const MultiRunOutput = ({
  runs,
  activeIndex,
  onNavigate,
}: {
  runs: PlaygroundRunResult[];
  activeIndex: number;
  onNavigate: (index: number) => void;
}) => {
  const stats = useMemo(() => computeRunStats(runs), [runs]);
  const isRunning = runs.some((run) => run.status === "running");
  const activeRun = runs[Math.min(activeIndex, runs.length - 1)];

  if (!activeRun) return null;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="bg-background/50 rounded-md border p-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold">
            {stats.completedCount}/{stats.totalCount} runs completed
            {stats.errorCount > 0 ? ` · ${stats.errorCount} failed` : ""}
          </span>
          {stats.latency && (
            <span className="text-muted-foreground">
              latency {stats.latency.min}–{stats.latency.max}ms (avg{" "}
              {stats.latency.avg}ms)
            </span>
          )}
          {stats.completedCount > 1 && (
            <span className="text-muted-foreground">
              {stats.distinctOutputCount} distinct output
              {stats.distinctOutputCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {stats.toolCallFrequencies.length > 0 && (
          <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {stats.toolCallFrequencies.map(({ signature, runCount }) => (
              <span key={signature}>
                {signature}: {runCount}/{stats.completedCount} runs
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <div className="bg-background/50 flex items-center justify-between border-b px-2 py-1 text-xs">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              disabled={activeIndex === 0}
              onClick={() => onNavigate(Math.max(activeIndex - 1, 0))}
              title="Previous run"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="font-bold whitespace-nowrap">
              Run {activeIndex + 1}/{runs.length}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              disabled={activeIndex >= runs.length - 1}
              onClick={() =>
                onNavigate(Math.min(activeIndex + 1, runs.length - 1))
              }
              title="Next run"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          <span className="text-muted-foreground flex items-center gap-1">
            {activeRun.status === "running" && <Spinner size="xxs" />}
            {activeRun.status === "error" && (
              <span className="text-destructive">failed</span>
            )}
            {activeRun.status === "completed" && `${activeRun.latencyMs}ms`}
          </span>
        </div>
        <div className="px-2 py-1.5">
          {activeRun.status === "error" ? (
            <pre className="text-destructive text-xs wrap-break-word whitespace-break-spaces">
              {activeRun.error}
            </pre>
          ) : (
            <>
              {activeRun.reasoning && (
                <div className="-ml-1">
                  <ThinkingBlock content={activeRun.reasoning} />
                </div>
              )}
              <pre className="text-xs wrap-break-word whitespace-break-spaces">
                {activeRun.content}
              </pre>
              {activeRun.toolCalls.map((toolCall) => (
                <div className="mt-2" key={toolCall.id}>
                  <ToolCallCard toolCall={toolCall} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {isRunning && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Spinner size="xxs" />
          <span>Executing…</span>
        </div>
      )}
    </div>
  );
};
