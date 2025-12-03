import { useMemo } from "react";
import type { z } from "zod/v4";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import {
  normalizeInput,
  normalizeOutput,
  combineInputOutputMessages,
  cleanLegacyOutput,
  extractAdditionalInput,
} from "@/src/utils/chatml";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";

// ChatML message type from schema
export type ChatMlMessage = z.infer<typeof ChatMlMessageSchema>;

// Tool definition extracted from messages
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

// Result from ChatML parsing hook
export interface ChatMLParserResult {
  canDisplayAsChat: boolean;
  allMessages: ChatMlMessage[];
  additionalInput: Record<string, unknown> | undefined;
  allTools: ToolDefinition[];
  toolCallCounts: Map<string, number>;
  messageToToolCallNumbers: Map<number, number[]>;
  toolNameToDefinitionNumber: Map<string, number>;
}

/**
 * Parse tool calls from a ChatML message.
 * Handles both standard tool_calls array and passthrough json.tool_calls.
 */
function parseToolCallsFromMessage(
  message: ReturnType<typeof combineInputOutputMessages>[0],
) {
  return message.tool_calls && Array.isArray(message.tool_calls)
    ? message.tool_calls
    : message.json?.tool_calls && Array.isArray(message.json?.tool_calls)
      ? message.json.tool_calls
      : [];
}

/**
 * Hook to parse input/output into ChatML format and extract tool information.
 *
 * Handles:
 * - ChatML message normalization from various input formats
 * - Tool definition extraction from messages
 * - Tool call counting and numbering (output messages only)
 * - Additional non-message input extraction
 */
export function useChatMLParser(
  input: Prisma.JsonValue | undefined,
  output: Prisma.JsonValue | undefined,
  metadata: Prisma.JsonValue | undefined,
  observationName: string | undefined,
): ChatMLParserResult {
  // Performance: Track deepParseJson calls
  const t0 = performance.now();
  const parsedInput = deepParseJson(input);
  const t1 = performance.now();
  const parsedOutput = deepParseJson(output);
  const t2 = performance.now();
  const parsedMetadata = deepParseJson(metadata);
  const t3 = performance.now();

  const inputSize = JSON.stringify(input || {}).length;
  const outputSize = JSON.stringify(output || {}).length;

  console.log(
    `[useChatMLParser] deepParseJson calls:`,
    `\n  - Input size: ${(inputSize / 1024).toFixed(2)}KB, parse time: ${(t1 - t0).toFixed(2)}ms`,
    `\n  - Output size: ${(outputSize / 1024).toFixed(2)}KB, parse time: ${(t2 - t1).toFixed(2)}ms`,
    `\n  - Metadata parse time: ${(t3 - t2).toFixed(2)}ms`,
  );

  return useMemo(() => {
    const startTime = performance.now();
    console.log("[useChatMLParser] Starting ChatML parsing in useMemo...");

    // Normalize input
    const t0 = performance.now();
    const ctx = { metadata: parsedMetadata, observationName };
    const inResult = normalizeInput(parsedInput, ctx);
    const t1 = performance.now();

    // Normalize output
    const outResult = normalizeOutput(parsedOutput, ctx);
    const t2 = performance.now();

    // Clean legacy output
    const outputClean = cleanLegacyOutput(parsedOutput, parsedOutput);
    const t3 = performance.now();

    // Combine messages
    const messages = combineInputOutputMessages(
      inResult,
      outResult,
      outputClean,
    );
    const t4 = performance.now();

    console.log(
      `[useChatMLParser] Normalization times:`,
      `\n  - normalizeInput: ${(t1 - t0).toFixed(2)}ms`,
      `\n  - normalizeOutput: ${(t2 - t1).toFixed(2)}ms`,
      `\n  - cleanLegacyOutput: ${(t3 - t2).toFixed(2)}ms`,
      `\n  - combineInputOutputMessages: ${(t4 - t3).toFixed(2)}ms`,
      `\n  - Messages created: ${messages.length}`,
    );

    // Extract all unique tools from messages (no numbering yet)
    const toolsMap = new Map<string, ToolDefinition>();

    for (const message of messages) {
      if (message.tools && Array.isArray(message.tools)) {
        for (const tool of message.tools) {
          if (!toolsMap.has(tool.name)) {
            toolsMap.set(tool.name, tool);
          }
        }
      }
    }

    const t5 = performance.now();

    // Count tool call invocations
    // Only number tool calls from OUTPUT messages (current invocation), not input (history)
    const inputMessageCount = inResult.success ? inResult.data.length : 0;
    let toolCallCounter = 0;
    const messageToToolCallNumbers = new Map<number, number[]>();
    const toolCallCounts = new Map<string, number>();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const isOutputMessage = i >= inputMessageCount;

      const toolCallList = parseToolCallsFromMessage(message);

      if (toolCallList.length > 0) {
        const messageToolNumbers: number[] = [];

        for (const toolCall of toolCallList) {
          const calledToolName =
            toolCall.name && typeof toolCall.name === "string"
              ? toolCall.name
              : // AI SDK has 'toolName'
                toolCall.toolName && typeof toolCall.toolName === "string"
                ? toolCall.toolName
                : undefined;

          if (calledToolName) {
            // Count tool calls from OUTPUT messages only
            if (isOutputMessage) {
              toolCallCounts.set(
                calledToolName,
                (toolCallCounts.get(calledToolName) || 0) + 1,
              );
              toolCallCounter++;
              messageToolNumbers.push(toolCallCounter);
            }
          }
        }

        if (messageToolNumbers.length > 0) {
          messageToToolCallNumbers.set(i, messageToolNumbers);
        }
      }
    }

    const t6 = performance.now();

    // Sort tools by display order (called first, then by call count)
    const sortedTools = Array.from(toolsMap.values()).sort((a, b) => {
      const callCountA = toolCallCounts.get(a.name) || 0;
      const callCountB = toolCallCounts.get(b.name) || 0;
      if (callCountA > 0 && callCountB === 0) return -1;
      if (callCountA === 0 && callCountB > 0) return 1;
      return callCountB - callCountA;
    });

    // Assign definition numbers based on sorted display order
    const toolNameToDefinitionNumber = new Map<string, number>();
    sortedTools.forEach((tool, index) => {
      toolNameToDefinitionNumber.set(tool.name, index + 1);
    });

    const totalTime = performance.now() - startTime;

    console.log(
      `[useChatMLParser] Tool processing:`,
      `\n  - Tool extraction: ${(t5 - t4).toFixed(2)}ms (${toolsMap.size} unique tools)`,
      `\n  - Tool counting loop: ${(t6 - t5).toFixed(2)}ms (${messages.length} messages)`,
      `\n  - Tool sorting: ${(performance.now() - t6).toFixed(2)}ms`,
      `\n  ⏱️  TOTAL useMemo TIME: ${totalTime.toFixed(2)}ms`,
    );

    return {
      canDisplayAsChat:
        (inResult.success || outResult.success) && messages.length > 0,
      allMessages: messages as ChatMlMessage[],
      additionalInput: extractAdditionalInput(parsedInput),
      allTools: sortedTools,
      toolCallCounts,
      messageToToolCallNumbers,
      toolNameToDefinitionNumber,
    };
  }, [parsedInput, parsedOutput, parsedMetadata, observationName]);
}

// Re-export for use in ChatMessage
export { parseToolCallsFromMessage };
