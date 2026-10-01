import type { EvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/types/EvaluatorAssistantSampleObservation";

export function getEvaluatorAssistantSampleObservation(
  observation: {
    id: string;
    traceId: string | null;
    startTime: Date | null;
  } | null,
): EvaluatorAssistantSampleObservation | null {
  const observationId = observation?.id.trim();
  const traceId = observation?.traceId?.trim();
  const startTime = observation?.startTime;

  if (
    !observationId ||
    !traceId ||
    !startTime ||
    Number.isNaN(startTime.getTime())
  ) {
    return null;
  }

  return {
    observationId,
    traceId,
    startTime: startTime.toISOString(),
  };
}
