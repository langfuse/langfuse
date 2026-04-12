import type { SpielwieseAgentNodeThinkingVM } from "../types/dashboard";

export const visionAgentThinking: SpielwieseAgentNodeThinkingVM = {
  reasonedSteps: 3,
  summary: "analyzing prompt",
  thinkingTokens: 428,
  title: "Vision reasoning trace",
  toolCalls: 1,
  steps: [
    {
      id: "vision-pass",
      label: "Vision pass",
      value: "Identify distinct food candidates from the plate image.",
    },
    {
      id: "portion-estimate",
      label: "Portion estimate",
      value:
        "Infer approximate gram weights from plate scale and plating context.",
    },
    {
      id: "output-shaping",
      label: "Output shaping",
      value: "Emit strict JSON with item names and estimated weights only.",
    },
  ],
};

export const nutritionAgentThinking: SpielwieseAgentNodeThinkingVM = {
  reasonedSteps: 2,
  summary: "checking totals",
  thinkingTokens: 684,
  title: "Nutrition reasoning trace",
  toolCalls: 2,
  steps: [
    {
      id: "reference-lookup",
      label: "Reference lookup",
      value: "Match each detected item to USDA FoodData Central entries.",
    },
    {
      id: "macro-rollup",
      label: "Macro rollup",
      value: "Compute item-level macros, then aggregate kcal and macro totals.",
    },
  ],
};

export const coachAgentThinking: SpielwieseAgentNodeThinkingVM = {
  reasonedSteps: 2,
  summary: "drafting summary",
  thinkingTokens: 236,
  title: "Coach reasoning trace",
  toolCalls: 1,
  steps: [
    {
      id: "signal-pick",
      label: "Signal pick",
      value:
        "Select the most relevant macro and calorie takeaways from the totals.",
    },
    {
      id: "tone-pass",
      label: "Tone pass",
      value: "Translate the nutrition data into short, friendly guidance.",
    },
  ],
};
