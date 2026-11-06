export const EVALUATOR_TARGET_TYPES = [
  "observation",
  "trace_transcript",
] as const;

export type EvaluatorTargetType = (typeof EVALUATOR_TARGET_TYPES)[number];

export const DEFAULT_EVALUATOR_TARGET_TYPE =
  "observation" satisfies EvaluatorTargetType;

export function evaluatorTargetTypeFromSampleScope(
  sampleScope: "observation" | "trace",
): EvaluatorTargetType {
  return sampleScope === "trace" ? "trace_transcript" : "observation";
}

export function sampleScopeFromEvaluatorTargetType(
  targetType: string | null | undefined,
): "observation" | "trace" {
  return targetType === "trace_transcript" ? "trace" : "observation";
}
