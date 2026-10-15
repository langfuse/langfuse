import type { InAppAgentQuestionnaireAnswers } from "@langfuse/shared/in-app-agent";
import type { QuestionnaireFormValues } from "./createQuestionnaireFormValues";

export function toQuestionnaireAnswers(
  values: QuestionnaireFormValues,
): InAppAgentQuestionnaireAnswers {
  return values.answers.map((answer) => {
    const otherText = answer.otherText.trim();
    const hasOtherText = answer.isOtherSelected && otherText.length > 0;

    return {
      selectedOptionIndexes: [...answer.selectedOptionIndexes].sort(
        (a, b) => a - b,
      ),
      otherText: hasOtherText ? otherText : null,
    };
  });
}
