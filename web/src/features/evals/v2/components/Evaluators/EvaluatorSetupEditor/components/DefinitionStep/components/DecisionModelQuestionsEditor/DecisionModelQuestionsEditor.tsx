import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import {
  DecisionModelQuestionList,
  OPENAI_QUESTION_EXAMPLES,
  QUESTION_EXAMPLES,
} from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelQuestionList/DecisionModelQuestionList";
import {
  createEmptyQuestion,
  getQuestionDraftErrors,
  usesPlainDecisionInstructions,
} from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import { preferredDecisionModel } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
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
  const model =
    state.selectedModel ?? preferredDecisionModel(connections.data?.data ?? []);
  const adapter = connections.data?.data.find(
    (connection) => connection.provider === model?.provider,
  )?.adapter;
  const openaiDecision = usesPlainDecisionInstructions({
    model: model?.model,
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

  const examples = openaiDecision
    ? OPENAI_QUESTION_EXAMPLES
    : QUESTION_EXAMPLES;

  return (
    <DecisionModelQuestionList
      questions={state.questions}
      expandedId={state.expandedQuestionId}
      stateKeys={state.stateKeys}
      errorsById={errorsById}
      onExpandedChange={state.actions.setExpandedQuestionId}
      onChange={state.actions.setQuestion}
      onAdd={() => state.actions.addQuestion(createEmptyQuestion())}
      examples={examples}
      onAddExample={(type) =>
        state.actions.addQuestion({
          id: safeRandomUUID(),
          ...examples[type],
        })
      }
      onRemove={state.actions.removeQuestion}
      onReorder={state.actions.reorderQuestion}
      scoreLevelLabels={openaiDecision}
      plainInstructions={openaiDecision}
    />
  );
}
