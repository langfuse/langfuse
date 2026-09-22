import {
  DECISION_MODEL_LIMITS,
  DecisionModelQuestionType,
  DecisionModelQuestionsSchema,
  type DecisionModelEntry,
  type DecisionModelQuestion,
  type DecisionModelQuestions,
} from "@langfuse/shared";

import type {
  DecisionModelQuestionDraft,
  DecisionModelQuestionDraftErrors,
} from "@/src/features/evals/v2/types/decisionModel";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";

/** The editor authors plain text; persisted JSON entries are shown serialized. */
function entryToText(entry: DecisionModelEntry | null | undefined): string {
  if (entry == null) return "";
  return typeof entry === "string" ? entry : JSON.stringify(entry);
}

export function createEmptyQuestion(
  type: DecisionModelQuestionType = DecisionModelQuestionType.CHOICE,
): DecisionModelQuestionDraft {
  return {
    id: safeRandomUUID(),
    type,
    scoreName: "",
    instructions: "",
    options: [
      { value: "", description: "" },
      { value: "", description: "" },
    ],
    levels: [{ description: "" }, { description: "" }],
    criteria: { true: "", false: "" },
  };
}

/** Reads persisted questions into editor drafts; unparseable input yields none. */
export function questionsToDrafts(
  questions: unknown,
): DecisionModelQuestionDraft[] {
  const parsed = DecisionModelQuestionsSchema.safeParse(questions);
  if (!parsed.success) return [];
  return parsed.data.map((question) => {
    const empty = createEmptyQuestion(question.type);
    const draft: DecisionModelQuestionDraft = {
      ...empty,
      id: question.id,
      scoreName: question.scoreName,
      instructions: entryToText(question.instructions),
    };
    switch (question.type) {
      case DecisionModelQuestionType.CHOICE:
        draft.options = question.options.map((option) => ({
          value: option.value,
          description: entryToText(option.description),
        }));
        break;
      case DecisionModelQuestionType.SCORE:
        draft.levels = question.levels.map((level) => ({
          description: entryToText(level.description),
        }));
        break;
      case DecisionModelQuestionType.NOUL:
        draft.criteria = {
          true: entryToText(question.criteria?.true),
          false: entryToText(question.criteria?.false),
        };
        break;
    }
    return draft;
  });
}

/**
 * Field-level problems per question, keyed by question id. Mirrors what the
 * server schema rejects so the form can point at the offending field.
 */
export function getQuestionDraftErrors(
  drafts: DecisionModelQuestionDraft[],
): Record<string, DecisionModelQuestionDraftErrors> {
  const scoreNameCounts = new Map<string, number>();
  for (const draft of drafts) {
    const name = draft.scoreName.trim();
    if (name) scoreNameCounts.set(name, (scoreNameCounts.get(name) ?? 0) + 1);
  }

  const errors: Record<string, DecisionModelQuestionDraftErrors> = {};
  for (const draft of drafts) {
    const own: DecisionModelQuestionDraftErrors = {};
    if (!draft.instructions.trim()) {
      own.instructions = "Every question needs instructions.";
    }
    const scoreName = draft.scoreName.trim();
    if (!scoreName) {
      own.scoreName = "Every question needs a score name.";
    } else if ((scoreNameCounts.get(scoreName) ?? 0) > 1) {
      own.scoreName = `Another question already writes “${scoreName}”.`;
    }
    if (draft.type === DecisionModelQuestionType.CHOICE) {
      const values = draft.options.map((option) => option.value.trim());
      if (values.length < DECISION_MODEL_LIMITS.minChoiceOptions) {
        own.options = `Add at least ${DECISION_MODEL_LIMITS.minChoiceOptions} options.`;
      } else if (values.some((value) => !value)) {
        own.options = "Every option needs a label.";
      } else if (new Set(values).size !== values.length) {
        own.options = "Option labels must be unique.";
      }
    }
    if (draft.type === DecisionModelQuestionType.SCORE) {
      const descriptions = draft.levels.map((level) =>
        level.description.trim(),
      );
      if (descriptions.length < DECISION_MODEL_LIMITS.minScoreLevels) {
        own.levels = `Add at least ${DECISION_MODEL_LIMITS.minScoreLevels} levels.`;
      } else if (descriptions.some((description) => !description)) {
        own.levels = "Every level needs a description.";
      }
    }
    if (Object.keys(own).length > 0) errors[draft.id] = own;
  }
  return errors;
}

/** Persistable questions, or null while any draft is incomplete. */
export function draftsToQuestions(
  drafts: DecisionModelQuestionDraft[],
): DecisionModelQuestions | null {
  if (
    drafts.length === 0 ||
    Object.keys(getQuestionDraftErrors(drafts)).length > 0
  ) {
    return null;
  }
  const questions = drafts.map((draft): DecisionModelQuestion => {
    const base = {
      id: draft.id,
      scoreName: draft.scoreName.trim(),
      instructions: draft.instructions.trim(),
    };
    switch (draft.type) {
      case DecisionModelQuestionType.CHOICE:
        return {
          ...base,
          type: draft.type,
          options: draft.options.map((option) => ({
            value: option.value.trim(),
            description: option.description.trim() || undefined,
          })),
        };
      case DecisionModelQuestionType.SCORE:
        return {
          ...base,
          type: draft.type,
          levels: draft.levels.map((level) => ({
            description: level.description.trim(),
          })),
        };
      case DecisionModelQuestionType.NOUL: {
        const criteria = {
          true: draft.criteria.true.trim() || undefined,
          false: draft.criteria.false.trim() || undefined,
        };
        return {
          ...base,
          type: draft.type,
          criteria: criteria.true || criteria.false ? criteria : undefined,
        };
      }
    }
  });
  const parsed = DecisionModelQuestionsSchema.safeParse(questions);
  return parsed.success ? parsed.data : null;
}
