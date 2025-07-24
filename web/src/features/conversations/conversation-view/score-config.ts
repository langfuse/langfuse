export type OmaiScoreConfig = {
  reviewer: string;
  options: Array<{
    id: string;
    label: string;
    options: readonly string[];
  }>;
};

const defaultScoreOptions1: OmaiScoreConfig["options"][number]["options"] = [
  "Just Ok",
  "Unneccessary Restating",
  "Sycophancy",
  "Not good",
  "Good",
  "Multiple Questions",
  "Gears Wrong",
  "Inquiry Needed",
  "Discussion",
  "Leading",
] as const;

const defaultScoreOptions2: OmaiScoreConfig["options"][number]["options"] = [
  "Autonomy Support",
  "Explaining the Method",
  "Competance",
  "First Gear",
  "Experiential Exploration",
  "Reliability/Consistency",
] as const;

// todo - optionally get this from environment json variable and parse with zod
// big file that matches the score configuration on google sheets
export const OMAI_SCORE_CONFIGS: Array<OmaiScoreConfig> = [
  {
    reviewer: "Bill",
    options: [
      {
        id: "overall-rating",
        label: "Overall Rating & Error Coding",
        options: defaultScoreOptions1,
      },
      {
        id: "conversation-indicator",
        label: "Gears & Good Conversation Indicator Coding",
        options: defaultScoreOptions2,
      },
    ],
  },
  {
    reviewer: "Jud",
    options: [
      {
        id: "overall-rating",
        label: "Overall Rating & Error Coding",
        options: defaultScoreOptions1,
      },
      {
        id: "conversation-indicator",
        label: "Gears & Good Conversation Indicator Coding",
        options: defaultScoreOptions2,
      },
    ],
  },
];

export function generateScoreName(
  scoreConfig: OmaiScoreConfig,
  optionId: OmaiScoreConfig["options"][number]["id"],
) {
  const option = scoreConfig.options.find((option) => option.id === optionId);

  if (!option) {
    throw new Error(`Option ${optionId} not found in score config`);
  }

  return `${scoreConfig.reviewer}:${optionId}`;
}
