import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "../context";
import { CheckIcon, CopyIcon, PlusIcon } from "@radix-ui/react-icons";
import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";
import { BracesIcon } from "lucide-react";
import { ToolCallCard } from "@/src/components/ChatMessages/ToolCallCard";

export const GenerationOutput = () => {
  const [isCopied, setIsCopied] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [isJson, setIsJson] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const { output, outputJson, addMessage, outputToolCalls } =
    usePlaygroundContext();

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(isJson ? outputJson : output);
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
          {isCopied ? <CheckIcon /> : <CopyIcon />}
        </Button>

        <Button
          className="flex items-center gap-1 whitespace-nowrap p-0 px-1"
          variant="secondary"
          onClick={!isAdded ? handleAddAssistantMessage : undefined}
          title="Add as assistant message"
          disabled={isAdded}
        >
          {isAdded ? <CheckIcon /> : <PlusIcon />}
          <span className="text-xs">Add to messages</span>
        </Button>
      </div>
    ) : null;

  return (
    <div className="relative h-full overflow-auto">
      <div
        className="h-full overflow-auto rounded-lg bg-muted p-4"
        ref={scrollAreaRef}
      >
        <div className="mb-4 flex w-full items-center">
          <p className="flex-1 text-xs font-semibold">Output</p>
          {copyButton}
        </div>
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
  );
};
