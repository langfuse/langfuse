import type { Value, ValueFormat } from "../../engine/values";

export type ScoreStatus = "pass" | "fail" | "neutral";

type EvaluationScore = {
  name: string;
  /** 0.87 with format "percent" → 87%; true → True; numbers count up when they appear. */
  value: Value;
  format?: ValueFormat;
  digits?: number;
  /** The dot's color. Defaults: booleans pass when true, numbers pass at or above `threshold`, otherwise neutral. */
  status?: ScoreStatus;
  threshold?: number;
};

export type EvaluationContent = {
  /** The card the evaluator reads from. */
  execution: string;
  /** The raised block. */
  evaluator: string;
  /** One row each, up to four. */
  scores: EvaluationScore[];
};

/** Characters per slot before an ellipsis; the frame is sized for these. */
export const EVALUATION_LIMITS = {
  execution: 24,
  evaluator: 18,
  name: 16,
  value: 9,
  scores: 4,
} as const;

export const EVALUATION_DEFAULTS: EvaluationContent = {
  execution: "LLM Execution",
  evaluator: "Evaluators",
  scores: [
    { name: "Accuracy", value: 0.87, format: "percent", status: "pass" },
    { name: "is JSON", value: true },
    { name: "Conciseness", value: 0.2, status: "fail" },
  ],
};

export function statusOf({
  value,
  status,
  threshold,
}: EvaluationScore): ScoreStatus {
  if (status) return status;
  if (typeof value === "boolean") return value ? "pass" : "fail";
  if (typeof value === "number" && threshold !== undefined)
    return value >= threshold ? "pass" : "fail";
  return "neutral";
}
