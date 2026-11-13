import type { InAppAgentQuestionnaireAnswers } from "@langfuse/shared/in-app-agent";
import type { QuestionnaireFormValues } from "./createQuestionnaireFormValues";

export function toQuestionnaireAnswers(
  values: QuestionnaireFormValues,
): InAppAgentQuestionnaireAnswers {
  return values.answers.map((answer) => {
    const otherText = answer.otherText.trim();

    return {
      selectedOptionIndexes: [...answer.selectedOptionIndexes].sort(
        (a, b) => a - b,
      ),
      otherText: otherText.length > 0 ? otherText : null,
    };
  });
}
