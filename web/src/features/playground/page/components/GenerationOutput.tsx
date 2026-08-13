import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "../context";
import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";
import { BracesIcon, Check, Copy, Plus } from "lucide-react";
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

  const handleCopy = () => {
    setIsCopied(true);
    const textToCopy = isJson ? outputJson : output;
    copyTextToClipboard(textToCopy);
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleAddAssistantMessage = () => {
    setIsAdded(true);
    const newMessage =
      outputToolCalls.length > 0
        ? addMessage({
            type: ChatMessageType.AssistantToolCall,
            role: ChatMessageRole.Assistant,
            content: output,
            toolCalls: outputToolCalls,
          })
        : addMessage({
            type: ChatMessageType.AssistantText,
            role: ChatMessageRole.Assistant,
            content: output,
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
    output || outputToolCalls.length ? (
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
          title="Copy output"
        >
          {isCopied ? checkIcon : copyIcon}
        </Button>

        <Button
          className="flex items-center gap-1 p-0 px-1 whitespace-nowrap"
          variant="secondary"
          onClick={!isAdded ? handleAddAssistantMessage : undefined}
          title="Add as assistant message"
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
          {runs.length > 1 ? (
            <MultiRunOutput runs={runs} />
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
 * Output panel for repeated ("Run xN") submissions: every run stacked with
 * its own latency and tool calls, preceded by deterministic consistency
 * stats (counts, frequencies, and latency distribution only).
 */
const MultiRunOutput = ({ runs }: { runs: PlaygroundRunResult[] }) => {
  const stats = useMemo(() => computeRunStats(runs), [runs]);
  const isRunning = runs.some((run) => run.status === "running");

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="bg-background/50 rounded-md border p-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold">
            {stats.completedCount}/{stats.totalCount} runs completed
            {stats.errorCount > 0 ? ` \u00b7 ${stats.errorCount} failed` : ""}
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

      {runs.map((run) => (
        <div key={run.index} className="rounded-md border">
          <div className="bg-background/50 text-muted-foreground flex items-center justify-between border-b px-2 py-1 text-xs">
            <span className="font-bold">Run {run.index + 1}</span>
            <span className="flex items-center gap-1">
              {run.status === "running" && <Spinner size="xxs" />}
              {run.status === "error" && (
                <span className="text-destructive">failed</span>
              )}
              {run.status === "completed" && `${run.latencyMs}ms`}
            </span>
          </div>
          <div className="px-2 py-1.5">
            {run.status === "error" ? (
              <pre className="text-destructive text-xs wrap-break-word whitespace-break-spaces">
                {run.error}
              </pre>
            ) : (
              <>
                {run.reasoning && (
                  <div className="-ml-1">
                    <ThinkingBlock content={run.reasoning} />
                  </div>
                )}
                <pre className="text-xs wrap-break-word whitespace-break-spaces">
                  {run.content}
                </pre>
                {run.toolCalls.map((toolCall) => (
                  <div className="mt-2" key={toolCall.id}>
                    <ToolCallCard toolCall={toolCall} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ))}
      {isRunning && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Spinner size="xxs" />
          <span>Executing…</span>
        </div>
      )}
    </div>
  );
};
