import { safeJsonParse, singleFilterList } from "@langfuse/shared";

import type { api } from "@/src/utils/api";
import { evaluatorAssistantTestResultStore } from "../store/evaluatorAssistantTestResultStore";
import { evaluatorAssistantUpdateSignalStore } from "../store/evaluatorAssistantUpdateSignalStore";
import { applyEvaluatorWorkbenchFilter } from "../store/evaluatorWorkbenchFilterRegistry";

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
  const updatedEvaluators = new Map<
    string,
    { updateId: string; surface: "code" | "prompt" }
  >();

  for (const toolCall of toolCalls) {
    if (
      source === "live" &&
      toolCall.toolName === "langfuse_setEvaluatorWorkbenchFilter" &&
      !toolCall.toolError
    ) {
      const parsedArguments = getToolArguments(toolCall.toolArguments);
      const evaluatorId =
        typeof parsedArguments?.evaluatorId === "string"
          ? parsedArguments.evaluatorId
          : null;
      const filter = singleFilterList.safeParse(parsedArguments?.filter);
      if (evaluatorId && filter.success && filter.data.length <= 20) {
        applyEvaluatorWorkbenchFilter(projectId, evaluatorId, filter.data);
      }
    }

    if (
      toolCall.toolName === "langfuse_updateEvaluator" &&
      !toolCall.toolError
    ) {
      const evaluatorId = getStringFromToolArguments(
        toolCall.toolArguments,
        "evaluatorId",
      );
      if (evaluatorId) {
        updatedEvaluators.set(evaluatorId, {
          updateId: toolCall.toolCallId,
          surface:
            getStringFromToolArguments(toolCall.toolArguments, "type") ===
            "LLM_AS_JUDGE"
              ? "prompt"
              : "code",
        });
      }
    }

    if (toolCall.toolName === "langfuse_testEvaluator" && conversationId) {
      const evaluatorId = getStringFromToolArguments(
        toolCall.toolArguments,
        "evaluatorId",
      );
      const observationId = getStringFromToolArguments(
        toolCall.toolArguments,
        "observationId",
      );
      const result = getEvaluatorTestResult(toolCall);
      if (evaluatorId && result) {
        const published = evaluatorAssistantTestResultStore.publish({
          projectId,
          evaluatorId,
          conversationId,
          observationId:
            toolCall.toolError && observationId === null
              ? undefined
              : observationId,
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

  return Array.from(updatedEvaluators, ([evaluatorId, { updateId, surface }]) =>
    utils.evalsV2.get.invalidate({ projectId, evaluatorId }).then(() => {
      if (source === "live") {
        evaluatorAssistantUpdateSignalStore.publish({
          projectId,
          evaluatorId,
          surface,
          updateId,
        });
      }
    }),
  );
}

function getStringFromToolArguments(
  toolArguments: unknown,
  key: "evaluatorId" | "observationId" | "type",
) {
  const parsedArguments = getToolArguments(toolArguments);
  if (!parsedArguments) {
    return null;
  }

  const value = parsedArguments[key];
  return typeof value === "string" ? value : null;
}

function getToolArguments(toolArguments: unknown) {
  const parsedArguments =
    typeof toolArguments === "string"
      ? safeJsonParse(toolArguments)
      : toolArguments;
  return typeof parsedArguments === "object" && parsedArguments !== null
    ? (parsedArguments as Record<string, unknown>)
    : null;
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
