import { z } from "zod";
import { jsonSchema } from "../../utils/zod";

/**
 * Decision-model evaluators (experimental) ask a System One model such as
 * TypeSafe Jev a list of typed questions about one state. The state is a JSON
 * object assembled from the evaluator's variable mapping (key → extractor);
 * each question writes its own score. Instructions are plain text and refer to
 * state keys by name, as in TypeSafe's own examples.
 */

export const DecisionModelQuestionType = {
  CHOICE: "choice",
  SCORE: "score",
  NOUL: "noul",
} as const;
export type DecisionModelQuestionType =
  (typeof DecisionModelQuestionType)[keyof typeof DecisionModelQuestionType];

export const DECISION_MODEL_LIMITS = {
  maxQuestions: 50,
  minChoiceOptions: 2,
  maxChoiceOptions: 255,
  minScoreLevels: 2,
  maxScoreLevels: 10,
  maxInstructionLength: 20_000,
  maxScoreNameLength: 100,
} as const;

/** TypeSafe accepts plain text or JSON structure for instructions and criteria. */
export const DecisionModelEntrySchema = z.union([
  z.string().trim().min(1).max(DECISION_MODEL_LIMITS.maxInstructionLength),
  jsonSchema,
]);
export type DecisionModelEntry = z.infer<typeof DecisionModelEntrySchema>;

const STATE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** State keys are referenced from instructions by name, so they must be identifiers. */
export const DecisionModelStateKeySchema = z
  .string()
  .regex(
    STATE_KEY_PATTERN,
    "State keys must start with a letter or underscore and contain only letters, digits, and underscores",
  );

const DecisionModelQuestionBaseSchema = z.object({
  /** Stable id chosen by the client; also the question id sent to the model. */
  id: z.string().trim().min(1).max(64),
  scoreName: z
    .string()
    .trim()
    .min(1)
    .max(DECISION_MODEL_LIMITS.maxScoreNameLength),
  instructions: DecisionModelEntrySchema,
});

export const DecisionModelChoiceOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  description: DecisionModelEntrySchema.nullish(),
});

export const DecisionModelChoiceQuestionSchema =
  DecisionModelQuestionBaseSchema.extend({
    type: z.literal(DecisionModelQuestionType.CHOICE),
    options: z
      .array(DecisionModelChoiceOptionSchema)
      .min(DECISION_MODEL_LIMITS.minChoiceOptions)
      .max(DECISION_MODEL_LIMITS.maxChoiceOptions)
      .refine(
        (options) =>
          new Set(options.map((option) => option.value)).size ===
          options.length,
        { message: "Choice options must be unique" },
      ),
  });

export const DecisionModelScoreQuestionSchema =
  DecisionModelQuestionBaseSchema.extend({
    type: z.literal(DecisionModelQuestionType.SCORE),
    /** Ordered from the low end of the scale to the high end; index = level. */
    levels: z
      .array(z.object({ description: DecisionModelEntrySchema }))
      .min(DECISION_MODEL_LIMITS.minScoreLevels)
      .max(DECISION_MODEL_LIMITS.maxScoreLevels),
  });

export const DecisionModelNoulQuestionSchema =
  DecisionModelQuestionBaseSchema.extend({
    type: z.literal(DecisionModelQuestionType.NOUL),
    criteria: z
      .object({
        true: DecisionModelEntrySchema.nullish(),
        false: DecisionModelEntrySchema.nullish(),
      })
      .nullish(),
  });

export const DecisionModelQuestionSchema = z.discriminatedUnion("type", [
  DecisionModelChoiceQuestionSchema,
  DecisionModelScoreQuestionSchema,
  DecisionModelNoulQuestionSchema,
]);
export type DecisionModelQuestion = z.infer<typeof DecisionModelQuestionSchema>;

export const DecisionModelQuestionsSchema = z
  .array(DecisionModelQuestionSchema)
  .min(1)
  .max(DECISION_MODEL_LIMITS.maxQuestions)
  .superRefine((questions, ctx) => {
    const ids = new Set<string>();
    const scoreNames = new Set<string>();
    questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate question id "${question.id}"`,
          path: [index, "id"],
        });
      }
      ids.add(question.id);
      if (scoreNames.has(question.scoreName)) {
        ctx.addIssue({
          code: "custom",
          message: `Score name "${question.scoreName}" is used by more than one question`,
          path: [index, "scoreName"],
        });
      }
      scoreNames.add(question.scoreName);
    });
  });
export type DecisionModelQuestions = z.infer<
  typeof DecisionModelQuestionsSchema
>;

/**
 * Parses persisted questions, returning a readable error instead of throwing
 * so callers can surface it on the evaluator.
 */
export function parseDecisionModelQuestions(
  value: unknown,
):
  | { success: true; data: DecisionModelQuestions }
  | { success: false; error: string } {
  const parsed = DecisionModelQuestionsSchema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  return {
    success: false,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; "),
  };
}
