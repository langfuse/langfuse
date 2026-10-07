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
  usesPlainDecisionInstructions,
} from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api } from "@/src/utils/api";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";

export function DecisionModelQuestionsEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const state = useStore(
    store,
    useShallow((state) => ({
      questions: state.questions,
      expandedQuestionId: state.expandedQuestionId,
      stateKeys: state.stateKeys,
      selectedModel: state.selectedModel,
      actions: state.actions,
    })),
  );
  const connections = api.llmApiKey.all.useQuery({
    projectId,
    includeDecisionModels: true,
  });
  const adapter = connections.data?.data.find(
    (connection) => connection.provider === state.selectedModel?.provider,
  )?.adapter;
  const openaiDecision = usesPlainDecisionInstructions({
    model: state.selectedModel?.model,
    adapter,
  });
  const errorsById = useMemo(() => {
    const errors = getQuestionDraftErrors(state.questions, {
      requireLevelLabels: openaiDecision,
    });
    for (const question of state.questions) {
      if (!question.instructions && !question.scoreName) {
        delete errors[question.id];
      }
    }
    return errors;
  }, [openaiDecision, state.questions]);

  return (
    <DecisionModelQuestionList
      questions={state.questions}
      expandedId={state.expandedQuestionId}
      stateKeys={state.stateKeys}
      errorsById={errorsById}
      onExpandedChange={state.actions.setExpandedQuestionId}
      onChange={state.actions.setQuestion}
      onAdd={() => state.actions.addQuestion(createEmptyQuestion())}
      onAddExample={(type) => {
        const example = QUESTION_EXAMPLES[type];
        state.actions.addQuestion({
          id: safeRandomUUID(),
          ...example,
          instructions: openaiDecision
            ? example.instructions.replace(/`/g, "")
            : example.instructions,
        });
      }}
      onRemove={state.actions.removeQuestion}
      onReorder={state.actions.reorderQuestion}
      scoreLevelLabels={openaiDecision}
      plainInstructions={openaiDecision}
    />
  );
}
