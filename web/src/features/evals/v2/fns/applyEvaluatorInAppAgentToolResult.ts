import {
  safeJsonParse,
  singleFilterList,
  type FilterState,
} from "@langfuse/shared";

import type { InAppAgentToolResult } from "@/src/features/in-app-agent";

type EvaluatorToolResultHandlers = {
  applyFilter: (filter: FilterState, updateId: string) => void;
  applyTestResult: (result: Record<string, unknown>, updateId: string) => void;
  evaluatorCreated: (evaluatorId: string) => void;
  evaluatorUpdated: (
    updateId: string,
    surface: "code" | "prompt",
    toolArguments: Record<string, unknown>,
  ) => Promise<void>;
};

export async function applyEvaluatorInAppAgentToolResult({
  evaluatorId,
  result,
  applyFilter,
  applyTestResult,
  evaluatorCreated,
  evaluatorUpdated,
}: {
  evaluatorId: string | null;
  result: InAppAgentToolResult;
} & EvaluatorToolResultHandlers) {
  const toolArguments = getRecord(result.toolArguments);

  if (
    result.toolName === "langfuse_createEvaluator" &&
    evaluatorId === null &&
    !result.toolError
  ) {
    const output = parseToolResultContent(result.toolResultContent);
    const createdEvaluatorId =
      typeof output?.id === "string" ? output.id : null;
    if (createdEvaluatorId) {
      evaluatorCreated(createdEvaluatorId);
    }
    return;
  }

  if (toolArguments?.evaluatorId !== evaluatorId) {
    return;
  }

  if (
    result.toolName === "langfuse_setEvaluatorWorkbenchFilter" &&
    !result.toolError
  ) {
    const filter = singleFilterList.safeParse(toolArguments.filter);
    if (filter.success && filter.data.length <= 20) {
      applyFilter(filter.data, result.toolCallId);
    }
    return;
  }

  if (result.toolName === "langfuse_testEvaluator") {
    const testResult = result.toolError
      ? { requestError: getToolErrorMessage(result.toolError) }
      : parseEvaluatorTestResult(result.toolResultContent);
    if (testResult) {
      applyTestResult(testResult, result.toolCallId);
    }
    return;
  }

  if (result.toolName === "langfuse_updateEvaluator" && !result.toolError) {
    await evaluatorUpdated(
      result.toolCallId,
      toolArguments.type === "LLM_AS_JUDGE" ? "prompt" : "code",
      toolArguments,
    );
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
}

function parseEvaluatorTestResult(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 3) {
    return null;
  }
  const parsed = getRecord(value);
  if (!parsed) {
    return null;
  }
  if (typeof parsed.success === "boolean") {
    return parsed;
  }
  if (parsed.output !== undefined) {
    return parseEvaluatorTestResult(parsed.output, depth + 1);
  }
  if (Array.isArray(parsed.content)) {
    const textItem = parsed.content.find((item) => {
      const record = getRecord(item);
      return record && typeof record.text === "string";
    });
    const text = getRecord(textItem)?.text;
    return parseEvaluatorTestResult(text, depth + 1);
  }
  return null;
}

function parseToolResultContent(value: unknown, depth = 0) {
  if (depth > 3) {
    return null;
  }
  const parsed = getRecord(value);
  if (!parsed) {
    return null;
  }
  if (typeof parsed.id === "string") {
    return parsed;
  }
  if (parsed.output !== undefined) {
    return parseToolResultContent(parsed.output, depth + 1);
  }
  if (Array.isArray(parsed.content)) {
    const textItem = parsed.content.find((item) => {
      const record = getRecord(item);
      return record && typeof record.text === "string";
    });
    return parseToolResultContent(getRecord(textItem)?.text, depth + 1);
  }
  return null;
}

function getToolErrorMessage(error: unknown) {
  const parsed = getRecord(error);
  if (parsed && typeof parsed.message === "string") {
    return parsed.message;
  }
  return typeof error === "string" ? error : "Evaluator test failed";
}
