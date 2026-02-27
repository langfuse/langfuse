import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "../context";
import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";
import { BracesIcon, Check, Copy, Plus } from "lucide-react";
import { ToolCallCard } from "@/src/components/ChatMessages/ToolCallCard";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { ThinkingBlock } from "@/src/components/trace2/components/IOPreview/components/ThinkingBlock";

export const GenerationOutput = () => {
  const [isCopied, setIsCopied] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [isJson, setIsJson] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const { output, outputReasoning, outputJson, addMessage, outputToolCalls } =
    usePlaygroundContext();

  const handleCopy = () => {
    setIsCopied(true);
    const textToCopy = isJson ? outputJson : output;
    void copyTextToClipboard(textToCopy);
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleAddAssistantMessage = () => {
    setIsAdded(true);
    if (outputToolCalls.length > 0) {
      addMessage({
        type: ChatMessageType.AssistantToolCall,
        role: ChatMessageRole.Assistant,
        content: output,
        toolCalls: outputToolCalls,
      });
    } else {
      addMessage({
        type: ChatMessageType.AssistantText,
        role: ChatMessageRole.Assistant,
        content: output,
      });
    }
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
      <div className="absolute right-3 top-2 flex space-x-1 opacity-50">
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
          className="flex items-center gap-1 whitespace-nowrap p-0 px-1"
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
        className="h-full overflow-auto rounded-lg bg-muted"
        ref={scrollAreaRef}
      >
        <div className="sticky top-0 z-10 bg-muted p-3">
          <div className="flex w-full items-center">
            <p className="flex-1 text-xs font-semibold">Output</p>
            {copyButton}
          </div>
        </div>
        <div className="px-4">
          {outputReasoning && !isJson && (
            <div className="-ml-1">
              <ThinkingBlock content={outputReasoning} />
            </div>
          )}
          <pre className="whitespace-break-spaces break-words text-xs">
            {isJson ? outputJson : output}
          </pre>
          {outputToolCalls.length > 0
            ? outputToolCalls.map((toolCall) => (
                <div className="mt-4" key={toolCall.id}>
                  <ToolCallCard toolCall={toolCall} />
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  );
};
