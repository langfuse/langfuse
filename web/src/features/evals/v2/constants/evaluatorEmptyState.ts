export const EVALUATOR_EMPTY_STATE_DOCS_HREF =
  "https://langfuse.com/docs/evaluation/overview";

export const EVALUATOR_EMPTY_STATE_STARTING_POINTS = [
  {
    templateKey: "topic-classifier",
    title: "Detect Topics",
    description:
      "Classify the requests going through your system to better understand volumes of different categories.",
    audience: "Any application",
    categoryKey: "recommended",
  },
  {
    templateKey: "user-disagreement",
    title: "Detect User Disagreement",
    description:
      "Catch conversations with unhappy users to know which traces deserve a deeper look.",
    audience: "Conversational apps",
    categoryKey: "conversation",
  },
] as const;
