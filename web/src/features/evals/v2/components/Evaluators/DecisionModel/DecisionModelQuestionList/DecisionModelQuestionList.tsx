import {
  DECISION_MODEL_LIMITS,
  DecisionModelQuestionType,
} from "@langfuse/shared";
import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Label } from "@/src/components/ui/label";
import { SortableList } from "@/src/features/evals/v2/components/SortableList/SortableList";
import { DecisionModelQuestionCard } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelQuestionCard/DecisionModelQuestionCard";
import { QUESTION_TYPE_COPY } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/QuestionTypeSelector/QuestionTypeSelector";
import type {
  DecisionModelQuestionDraft,
  DecisionModelQuestionDraftErrors,
} from "@/src/features/evals/v2/types/decisionModel";

export const QUESTION_EXAMPLES: Record<
  DecisionModelQuestionType,
  Omit<DecisionModelQuestionDraft, "id">
> = {
  [DecisionModelQuestionType.CHOICE]: {
    type: DecisionModelQuestionType.CHOICE,
    scoreName: "send_readiness",
    instructions: "Is `output` ready to send as an answer to `input`?",
    options: [
      {
        value: "ready",
        description: "Answers the request and states the next step.",
      },
      {
        value: "needs_revision",
        description: "Accurate but incomplete or unclear.",
      },
      {
        value: "unsafe",
        description: "Contradicts policy or invents information.",
      },
    ],
    levels: [],
    criteria: { true: "", false: "" },
  },
  [DecisionModelQuestionType.SCORE]: {
    type: DecisionModelQuestionType.SCORE,
    scoreName: "customer_frustration",
    instructions: "How frustrated is the customer in `input`?",
    options: [],
    levels: [
      { label: "Calm", description: "Calm, just stating facts" },
      { label: "Frustrated", description: "Frustrated but civil" },
      {
        label: "Angry",
        description: "Very angry, strong language or threatening to leave",
      },
    ],
    criteria: { true: "", false: "" },
  },
  [DecisionModelQuestionType.NOUL]: {
    type: DecisionModelQuestionType.NOUL,
    scoreName: "refund_requested",
    instructions: "Does `input` request a refund?",
    options: [],
    levels: [],
    criteria: { true: "", false: "" },
  },
};

/** OpenAI questions cannot name state fields, so these examples stay plain. */
export const OPENAI_QUESTION_EXAMPLES: Record<
  DecisionModelQuestionType,
  Omit<DecisionModelQuestionDraft, "id">
> = {
  [DecisionModelQuestionType.CHOICE]: {
    ...QUESTION_EXAMPLES[DecisionModelQuestionType.CHOICE],
    instructions: "Is the reply ready to send to the customer?",
  },
  [DecisionModelQuestionType.SCORE]: {
    ...QUESTION_EXAMPLES[DecisionModelQuestionType.SCORE],
    instructions: "How frustrated is the customer?",
  },
  [DecisionModelQuestionType.NOUL]: {
    ...QUESTION_EXAMPLES[DecisionModelQuestionType.NOUL],
    instructions: "Does the customer request a refund?",
  },
};

/**
 * The ordered questions of a decision-model evaluator. Every question is
 * answered in the same call, so adding one costs only its own tokens; the
 * footer says so because that is the reason to use a decision model.
 */
export function DecisionModelQuestionList({
  questions,
  expandedId,
  stateKeys,
  errorsById = {},
  onExpandedChange,
  onChange,
  onAdd,
  onAddExample,
  onRemove,
  onReorder,
  scoreLevelLabels = false,
  plainInstructions = false,
  examples = QUESTION_EXAMPLES,
}: {
  questions: DecisionModelQuestionDraft[];
  expandedId: string | null;
  stateKeys: string[];
  errorsById?: Record<string, DecisionModelQuestionDraftErrors>;
  onExpandedChange: (id: string | null) => void;
  onChange: (question: DecisionModelQuestionDraft) => void;
  onAdd: () => void;
  onAddExample: (type: DecisionModelQuestionType) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  scoreLevelLabels?: boolean;
  plainInstructions?: boolean;
  examples?: Record<
    DecisionModelQuestionType,
    Omit<DecisionModelQuestionDraft, "id">
  >;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Label className="flex items-baseline gap-1.5">
        Questions
        <span className="inline-flex self-center">
          <InfoTooltip label="About questions">
            Each question is one snap judgment about the state and writes one
            score. All questions are answered in a single model call, so a
            second or tenth question costs only its own tokens.
          </InfoTooltip>
        </span>
        <span className="text-muted-foreground text-xs leading-none font-normal">
          {questions.length} of {DECISION_MODEL_LIMITS.maxQuestions}
        </span>
      </Label>

      {questions.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-start gap-3 rounded-md border border-dashed p-4 text-sm">
          <p>
            No questions yet. Start from an example to see the shape of each
            type, or add a blank question.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.values(DecisionModelQuestionType).map((type) => {
              const copy = QUESTION_TYPE_COPY[type];
              return (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddExample(type)}
                >
                  <Sparkles className="icon-base text-icon-foreground mr-1" />
                  {copy.label}: “{examples[type].instructions}”
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <SortableList
          items={questions}
          getId={(question) => question.id}
          getLabel={(question, index) =>
            question.scoreName || `question ${index + 1}`
          }
          onReorder={onReorder}
          gap="md"
          renderItem={(question, index) => (
            <DecisionModelQuestionCard
              question={question}
              index={index}
              stateKeys={stateKeys}
              expanded={expandedId === question.id}
              onExpandedChange={(expanded) =>
                onExpandedChange(expanded ? question.id : null)
              }
              onChange={onChange}
              onRemove={
                questions.length > 1 ? () => onRemove(question.id) : null
              }
              errors={errorsById[question.id]}
              scoreLevelLabels={scoreLevelLabels}
              plainInstructions={plainInstructions}
            />
          )}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="icon-base text-icon-foreground mr-1" />
          Add question
        </Button>
        <span className="text-muted-foreground text-xs">
          Answered together in one call; extra questions add only their own
          tokens.
        </span>
      </div>
    </div>
  );
}
