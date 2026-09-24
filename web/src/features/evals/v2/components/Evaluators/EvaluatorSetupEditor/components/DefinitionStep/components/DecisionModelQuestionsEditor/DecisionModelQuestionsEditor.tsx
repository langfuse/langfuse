import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import {
  DecisionModelQuestionList,
  QUESTION_EXAMPLES,
} from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelQuestionList/DecisionModelQuestionList";
import {
  createEmptyQuestion,
  getQuestionDraftErrors,
} from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";

export function DecisionModelQuestionsEditor({
  store,
}: {
  store: EvaluatorSetupStore;
}) {
  const state = useStore(
    store,
    useShallow((state) => ({
      questions: state.questions,
      expandedQuestionId: state.expandedQuestionId,
      stateKeys: state.stateKeys,
      actions: state.actions,
    })),
  );
  const errorsById = useMemo(() => {
    const errors = getQuestionDraftErrors(state.questions);
    for (const question of state.questions) {
      if (!question.instructions && !question.scoreName) {
        delete errors[question.id];
      }
    }
    return errors;
  }, [state.questions]);

  return (
    <DecisionModelQuestionList
      questions={state.questions}
      expandedId={state.expandedQuestionId}
      stateKeys={state.stateKeys}
      errorsById={errorsById}
      onExpandedChange={state.actions.setExpandedQuestionId}
      onChange={state.actions.setQuestion}
      onAdd={() => state.actions.addQuestion(createEmptyQuestion())}
      onAddExample={(type) =>
        state.actions.addQuestion({
          id: safeRandomUUID(),
          ...QUESTION_EXAMPLES[type],
        })
      }
      onRemove={state.actions.removeQuestion}
      onReorder={state.actions.reorderQuestion}
    />
  );
}
