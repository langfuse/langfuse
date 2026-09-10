/* eslint-disable @repo/no-style-props, @repo/no-null-render */
import { Wrench } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import type { z } from "zod";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

interface ToolCallInvocationsViewProps {
  message: z.infer<typeof ChatMlMessageSchema>;
  toolCallNumbers?: number[];
  className?: string;
}

/**
 * Projection-only extras on tool-call entries. The normalized-parser
 * projection (`toIOPreview`) builds messages without schema validation and
 * supplies decoded `arguments` plus a paired `response`; the wire schema
 * (`ToolCallSchema`) deliberately stays untouched so legacy validation is
 * unchanged. Legacy messages never carry `response`.
 */
type ToolCallEntry = NonNullable<
  z.infer<typeof ChatMlMessageSchema>["tool_calls"]
>[number] & {
  arguments: unknown;
  response?: { output: unknown; isError?: boolean } | null;
};

/** Tool outputs are frequently JSON serialized as a string; show the
 * structure when it parses, the raw string otherwise. */
function parseIfJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function ToolCallInvocationsView({
  message,
  toolCallNumbers,
  className,
}: ToolCallInvocationsViewProps) {
  const toolCalls = message.tool_calls as ToolCallEntry[] | undefined;

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
                <Wrench className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-foreground font-mono text-xs font-bold">
                  {invocationNumber !== undefined && (
                    <span className="mr-1">{invocationNumber}.</span>
                  )}
                  {toolCall.name}
                </span>
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
              <div className="text-muted-foreground mb-1.5 text-xs font-bold">
                Arguments
              </div>
              <PrettyJsonView
                json={parsedArguments}
                currentView="pretty"
                codeClassName="text-xs"
              />
            </div>

            {/* Response view: paired tool result. Only the normalized-parser
                projection sets `response`, so this section is beta-only by
                data presence — legacy messages never carry the field. */}
            {toolCall.response !== undefined && (
              <div className="py-2 [&_.io-message-content]:px-0">
                <div className="text-muted-foreground mb-1.5 text-xs font-bold">
                  Response
                  {toolCall.response?.isError && (
                    <span className="text-dark-red ml-1">(error)</span>
                  )}
                </div>
                {toolCall.response === null ? (
                  <div className="text-muted-foreground text-xs">
                    No response
                  </div>
                ) : (
                  <PrettyJsonView
                    json={parseIfJsonString(toolCall.response.output)}
                    currentView="pretty"
                    codeClassName="text-xs"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
