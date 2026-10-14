import type { DecisionModelQuestionType } from "@langfuse/shared";

export type DecisionModelQuestionDraft = {
  id: string;
  type: DecisionModelQuestionType;
  scoreName: string;
  instructions: string;
  options: Array<{ value: string; description: string }>;
  levels: Array<{ description: string }>;
  criteria: { true: string; false: string };
};

export type DecisionModelQuestionDraftErrors = Partial<
  Record<"scoreName" | "instructions" | "options" | "levels", string>
>;

/** Reads the state keys a question refers to in backticks. */
export function extractReferencedStateKeys(instructions: string): string[] {
  return [
    ...new Set(
      Array.from(instructions.matchAll(/`([A-Za-z_][A-Za-z0-9_.[\]-]*)`/g)).map(
        ([, key]) => key.split(/[.[]/)[0]!,
      ),
    ),
  ];
}

/** Turns a question into a snake_case score name suggestion. */
export function suggestScoreName(instructions: string): string {
  return instructions
    .toLowerCase()
    .replace(/`[^`]*`/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, 3)
    .join("_");
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "does",
  "do",
  "did",
  "to",
  "of",
  "in",
  "on",
  "for",
  "this",
  "that",
  "it",
  "as",
  "how",
  "should",
  "can",
  "what",
  "which",
  "and",
  "or",
]);
