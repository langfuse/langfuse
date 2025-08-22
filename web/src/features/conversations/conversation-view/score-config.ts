export type OmaiScoreConfig = {
  id: string;
  label: string;
  options: readonly string[];
};

const defaultScoreOptions1 = ["Good", "Just Ok", "Not good"] as const;

const errorCodingOptions = [
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

const gearOptions = ["First Gear", "Second Gear", "Third Gear"] as const;

const defaultScoreOptions2 = [
  "Competence",
  "Checking Comprehension",
  "Value Alignment",
  "Empathy/Rapport",
  "Transparency",
  "Reliability/Consistency",
  "Autonomy Support",
  "Experiential Exploration",
  "Explaining the Method",
] as const;

// todo - optionally get this from environment json variable and parse with zod
// big file that matches the score configuration on google sheets
export const OMAI_SCORE_CONFIGS: Array<OmaiScoreConfig> = [
  {
    id: "overall-rating",
    label: "Overall Rating",
    options: defaultScoreOptions1,
  },
  {
    id: "error-coding",
    label: "Error Coding",
    options: errorCodingOptions,
  },
  {
    id: "gears",
    label: "Gears",
    options: gearOptions,
  },
  {
    id: "conversation-indicator",
    label: "Good Conversation Indicator",
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
