import { safeJsonParse } from "@langfuse/shared";

import type { api } from "@/src/utils/api";
import { evaluatorAssistantTestResultStore } from "../store/evaluatorAssistantTestResultStore";
import { evaluatorAssistantUpdateSignalStore } from "../store/evaluatorAssistantUpdateSignalStore";

export type EvaluatorAssistantCompletedToolCall = {
  toolCallId: string;
  toolName: string;
  toolArguments?: unknown;
  toolResultContent?: string;
  toolError?: unknown;
};

export function performEvaluatorAssistantToolSideEffects({
  toolCalls,
  projectId,
  conversationId,
  source,
  utils,
}: {
  toolCalls: readonly EvaluatorAssistantCompletedToolCall[];
  projectId: string;
  conversationId: string | null;
  source: "live" | "hydrated";
  utils: ReturnType<typeof api.useUtils>;
}) {
  const updatedEvaluators = new Map<string, string>();

  for (const toolCall of toolCalls) {
    if (toolCall.toolName === "langfuse_updateEvaluator") {
      const evaluatorId = getStringFromToolArguments(
        toolCall.toolArguments,
        "evaluatorId",
      );
      if (evaluatorId) {
        updatedEvaluators.set(evaluatorId, toolCall.toolCallId);
      }
    }

    if (toolCall.toolName === "langfuse_testEvaluator" && conversationId) {
      const evaluatorId = getStringFromToolArguments(
        toolCall.toolArguments,
        "evaluatorId",
      );
      const result = getEvaluatorTestResult(toolCall);
      if (evaluatorId && result) {
        const published = evaluatorAssistantTestResultStore.publish({
          projectId,
          evaluatorId,
          conversationId,
          observationId: getStringFromToolArguments(
            toolCall.toolArguments,
            "observationId",
          ),
          toolCallId: toolCall.toolCallId,
          result,
        });
        if (source === "live" && published) {
          evaluatorAssistantUpdateSignalStore.publish({
            projectId,
            evaluatorId,
            surface: "test",
            updateId: toolCall.toolCallId,
          });
        }
      }
    }
  }

  return Array.from(updatedEvaluators, ([evaluatorId, updateId]) =>
    utils.evalsV2.get.invalidate({ projectId, evaluatorId }).then(() => {
      if (source === "live") {
        evaluatorAssistantUpdateSignalStore.publish({
          projectId,
          evaluatorId,
          surface: "code",
          updateId,
        });
      }
    }),
  );
}

function getStringFromToolArguments(
  toolArguments: unknown,
  key: "evaluatorId" | "observationId",
) {
  const parsedArguments =
    typeof toolArguments === "string"
      ? safeJsonParse(toolArguments)
      : toolArguments;
  if (typeof parsedArguments !== "object" || parsedArguments === null) {
    return null;
  }

  const value = (parsedArguments as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function getEvaluatorTestResult(toolCall: EvaluatorAssistantCompletedToolCall) {
  if (toolCall.toolError) {
    return { requestError: getToolErrorMessage(toolCall.toolError) };
  }

  return parseEvaluatorTestResultContent(toolCall.toolResultContent);
}

function parseEvaluatorTestResultContent(
  content: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 3) {
    return null;
  }

  const parsed = typeof content === "string" ? safeJsonParse(content) : content;
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;

  if (typeof record.success === "boolean") {
    return record;
  }

  if (record.output !== undefined) {
    return parseEvaluatorTestResultContent(record.output, depth + 1);
  }

  if (Array.isArray(record.content)) {
    const contentItems = record.content as unknown[];
    const textContent: unknown = contentItems.find((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string";
    });
    if (textContent) {
      return parseEvaluatorTestResultContent(
        (textContent as Record<string, unknown>).text,
        depth + 1,
      );
    }
  }

  return null;
}

function getToolErrorMessage(error: unknown) {
  const parsed = typeof error === "string" ? safeJsonParse(error) : error;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "message" in parsed &&
    typeof parsed.message === "string"
  ) {
    return parsed.message;
  }

  return typeof error === "string" ? error : "Evaluator test failed";
}
