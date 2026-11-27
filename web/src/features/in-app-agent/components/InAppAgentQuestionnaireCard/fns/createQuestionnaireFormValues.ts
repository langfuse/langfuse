import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";

export function createQuestionnaireFormValues(
  questions: readonly InAppAgentQuestionnaireQuestion[],
) {
  return {
    answers: questions.map(() => ({
      selectedOptionIndexes: [] as number[],
      otherText: "",
    })),
  };
}

export type QuestionnaireFormValues = ReturnType<
  typeof createQuestionnaireFormValues
>;

export type QuestionnaireFormAnswer =
  QuestionnaireFormValues["answers"][number];
