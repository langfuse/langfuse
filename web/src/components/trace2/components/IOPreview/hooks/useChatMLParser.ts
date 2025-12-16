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
  inputMessageCount: number;
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
 *
 * Performance optimization:
 * - Accepts optional pre-parsed data to avoid duplicate parsing
 * - When pre-parsed data is provided (from Web Worker), skips synchronous deepParseJson
 */
export function useChatMLParser(
  input: Prisma.JsonValue | undefined,
  output: Prisma.JsonValue | undefined,
  metadata: Prisma.JsonValue | undefined,
  observationName: string | undefined,
  preParsedInput?: unknown,
  preParsedOutput?: unknown,
  preParsedMetadata?: unknown,
): ChatMLParserResult {
  // Use pre-parsed data if available (from Web Worker), otherwise parse synchronously
  // This eliminates ~100ms of duplicate parsing when data comes from useParsedObservation
  const parsedInput =
    preParsedInput !== undefined
      ? preParsedInput
      : deepParseJson(input, { maxSize: 300_000, maxDepth: 25 });
  const parsedOutput =
    preParsedOutput !== undefined
      ? preParsedOutput
      : deepParseJson(output, { maxSize: 300_000, maxDepth: 25 });
  const parsedMetadata =
    preParsedMetadata !== undefined
      ? preParsedMetadata
      : deepParseJson(metadata, { maxSize: 100_000, maxDepth: 25 });

  return useMemo(() => {
    // Normalize input
    const ctx = { metadata: parsedMetadata, observationName };
    const inResult = normalizeInput(parsedInput, ctx);

    // Normalize output
    const outResult = normalizeOutput(parsedOutput, ctx);

    // Clean legacy output
    const outputClean = cleanLegacyOutput(parsedOutput, parsedOutput);

    // Combine messages
    const messages = combineInputOutputMessages(
      inResult,
      outResult,
      outputClean,
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

    return {
      canDisplayAsChat:
        (inResult.success || outResult.success) && messages.length > 0,
      allMessages: messages as ChatMlMessage[],
      additionalInput: extractAdditionalInput(parsedInput),
      allTools: sortedTools,
      toolCallCounts,
      messageToToolCallNumbers,
      toolNameToDefinitionNumber,
      inputMessageCount,
    };
  }, [parsedInput, parsedOutput, parsedMetadata, observationName]);
}

// Re-export for use in ChatMessage
export { parseToolCallsFromMessage };
