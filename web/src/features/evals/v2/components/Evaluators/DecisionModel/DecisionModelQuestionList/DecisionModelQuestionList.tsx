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
      { description: "Calm, just stating facts" },
      { description: "Frustrated but civil" },
      { description: "Very angry, strong language or threatening to leave" },
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
}) {
  return (
    <div className="flex flex-col gap-3">
      <Label className="flex items-center gap-1.5">
        Questions
        <InfoTooltip label="About questions">
          Each question is one snap judgment about the state and writes one
          score. All questions are answered in a single model call, so a second
          or tenth question costs only its own tokens.
        </InfoTooltip>
        <span className="text-muted-foreground text-xs font-normal">
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
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {copy.label}: “
                  {QUESTION_EXAMPLES[type].instructions.replace(/`/g, "")}”
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
            />
          )}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
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
