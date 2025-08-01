export type OmaiScoreConfig = {
  id: string;
  label: string;
  options: readonly string[];
};

const defaultScoreOptions1 = [
  "Good",
  "Just Ok",
  "Not good",
  "Discussion",
  "Sycophancy",
  "Vague",
  "Leading",
  "Unnecessary Restating",
  "Wrong Information",
  "Gears Wrong",
  "Safety Flag",
  "Multiple Questions",
  "Overinterpretation",
  "Giving Advice",
  "Inquiry Needed",
] as const;

const defaultScoreOptions2 = [
  "Competence",
  "Checking Comprehension",
  "Value Alignment",
  "Empathy/Rapport",
  "Transparency",
  "Reliability/Consistency",
  "Autonomy Support",
  "First Gear",
  "Second Gear",
  "Third Gear",
  "Experiential Exploration",
  "Explaining the Method",
] as const;

// todo - optionally get this from environment json variable and parse with zod
// big file that matches the score configuration on google sheets
export const OMAI_SCORE_CONFIGS: Array<OmaiScoreConfig> = [
  {
    id: "overall-rating",
    label: "Overall Rating & Error Coding",
    options: defaultScoreOptions1,
  },
  {
    id: "conversation-indicator",
    label: "Gears & Good Conversation Indicator",
    options: defaultScoreOptions2,
  },
];

export function generateScoreName(
  optionId: OmaiScoreConfig["id"],
  userName: string,
) {
  const option = OMAI_SCORE_CONFIGS.find((option) => option.id === optionId);

  if (!option) {
    throw new Error(`Option ${optionId} not found in score config`);
  }

  return `${userName}:${optionId}`;
}
