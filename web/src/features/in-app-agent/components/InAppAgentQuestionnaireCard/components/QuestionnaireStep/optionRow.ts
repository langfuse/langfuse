export const OTHER_ANSWER_LABEL = "Type your answer";

export function withRecommended(label: string, isRecommended: boolean) {
  return isRecommended ? `${label} (Recommended)` : label;
}
