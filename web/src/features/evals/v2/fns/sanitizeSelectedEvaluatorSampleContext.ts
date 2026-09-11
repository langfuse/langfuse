import type { AgUiContext } from "@langfuse/shared/in-app-agent";

import { SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION } from "@/src/features/evals/v2/constants/evaluatorAssistant";

const MAX_CONTEXT_ID_LENGTH = 80;
const MAX_CONTEXT_VALUE_LENGTH = 500;

export function sanitizeSelectedEvaluatorSampleContext(
  context: AgUiContext,
  projectId: string,
): AgUiContext[number] | null {
  const sampleContexts = context.filter(
    (item) =>
      item.description === SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
  );
  if (sampleContexts.length !== 1) return null;

  const value = sampleContexts[0]?.value;
  if (!value || value.length > MAX_CONTEXT_VALUE_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  if (record.projectId !== projectId) return null;

  const evaluatorId = readContextId(record.evaluatorId);
  const observationId = readContextId(record.observationId);
  const traceId = readContextId(record.traceId);
  const startTime =
    typeof record.startTime === "string" ? record.startTime.trim() : "";
  if (
    !evaluatorId ||
    !observationId ||
    !traceId ||
    !startTime ||
    startTime.length > 100 ||
    Number.isNaN(Date.parse(startTime))
  ) {
    return null;
  }

  return {
    description: SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
    value: JSON.stringify({
      evaluatorId,
      observationId,
      traceId,
      startTime: new Date(startTime).toISOString(),
    }),
  };
}

function readContextId(value: unknown) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id && id.length <= MAX_CONTEXT_ID_LENGTH ? id : null;
}
