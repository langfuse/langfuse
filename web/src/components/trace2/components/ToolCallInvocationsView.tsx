import { Wrench } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import type { z } from "zod/v4";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

interface ToolCallInvocationsViewProps {
  message: z.infer<typeof ChatMlMessageSchema>;
  toolCallNumbers?: number[];
  className?: string;
}

export function ToolCallInvocationsView({
  message,
  toolCallNumbers,
  className,
}: ToolCallInvocationsViewProps) {
  const toolCalls = message.tool_calls;

  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {toolCalls.map((toolCall, index) => {
        const invocationNumber = toolCallNumbers?.[index];
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
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-xs font-medium text-foreground">
                  {invocationNumber !== undefined && (
                    <span className="mr-1">{invocationNumber}.</span>
                  )}
                  {toolCall.name}
                </span>
              </div>

              {/* Right: Call ID if available */}
              {toolCall.id && (
                <span className="font-mono text-xs text-muted-foreground">
                  {toolCall.id}
                </span>
              )}
            </div>

            {/* Arguments view */}
            <div className="py-2 [&_.io-message-content]:px-0">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
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
