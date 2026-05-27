import { Wrench } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { ToolExtractionWarningIcon } from "@/src/components/trace/components/IOPreview/components/ToolExtractionWarningIcon";
import type { z } from "zod";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

interface ToolCallInvocationsViewProps {
  message: z.infer<typeof ChatMlMessageSchema>;
  toolCallNumbers?: number[];
  className?: string;
  toolNamesWithExtractionWarning?: Set<string>;
}

export function ToolCallInvocationsView({
  message,
  toolCallNumbers,
  className,
  toolNamesWithExtractionWarning,
}: ToolCallInvocationsViewProps) {
  const toolCalls = message.tool_calls;

  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {toolCalls.map((toolCall, index) => {
        const invocationNumber = toolCallNumbers?.[index];
        const aiSdkToolCall = toolCall as { toolName?: unknown };
        const toolCallName =
          typeof toolCall.name === "string"
            ? toolCall.name
            : typeof aiSdkToolCall.toolName === "string"
              ? aiSdkToolCall.toolName
              : undefined;
        const showExtractionWarning =
          toolCallName !== undefined &&
          Boolean(toolNamesWithExtractionWarning?.has(toolCallName));
        // Parse arguments if they're a JSON string
        let parsedArguments = toolCall.arguments;
        if (typeof toolCall.arguments === "string") {
          try {
            parsedArguments = JSON.parse(toolCall.arguments);
          } catch {
            // Keep as string if parsing fails
            parsedArguments = toolCall.arguments;
          }
        }

        return (
          <div
            key={`${toolCall.id}-${index}`}
            className={cn(
              "w-full border-t px-2 py-2",
              (message.role === "assistant" ||
                message.name === "Output" ||
                message.name === "Model") &&
                "bg-accent-light-green",
            )}
          >
            {/* Card header */}
            <div className="flex w-full items-center justify-between gap-2 py-1">
              {/* Left: Tool icon + number + name */}
              <div className="flex items-center gap-2">
                <Wrench className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-foreground font-mono text-xs font-medium">
                  {invocationNumber !== undefined && (
                    <span className="mr-1">{invocationNumber}.</span>
                  )}
                  {toolCallName ?? toolCall.name}
                </span>
                {showExtractionWarning && <ToolExtractionWarningIcon />}
              </div>

              {/* Right: Call ID if available */}
              {toolCall.id && (
                <span className="text-muted-foreground font-mono text-xs">
                  {toolCall.id}
                </span>
              )}
            </div>

            {/* Arguments view */}
            <div className="py-2 [&_.io-message-content]:px-0">
              <div className="text-muted-foreground mb-1.5 text-xs font-medium">
                Arguments
              </div>
              <PrettyJsonView
                json={parsedArguments}
                currentView="pretty"
                codeClassName="text-xs"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
