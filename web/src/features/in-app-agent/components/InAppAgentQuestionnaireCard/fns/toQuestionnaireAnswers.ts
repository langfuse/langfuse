import type {
  InAppAgentQuestionnaireAnswers,
  InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import type { QuestionnaireFormValues } from "./createQuestionnaireFormValues";

export function toQuestionnaireAnswers(
  values: QuestionnaireFormValues,
  questions: readonly InAppAgentQuestionnaireQuestion[],
): InAppAgentQuestionnaireAnswers {
  return questions.map((question, index) => {
    const answer = values.answers[index];
    const isFreeText = question.options.length === 0;
    const otherText = answer.otherText.trim();
    const hasOtherText =
      (isFreeText || answer.isOtherSelected) && otherText.length > 0;

    return {
      selectedOptionIndexes: [...answer.selectedOptionIndexes].sort(
        (a, b) => a - b,
      ),
      otherText: hasOtherText ? otherText : null,
    };
  });
}
