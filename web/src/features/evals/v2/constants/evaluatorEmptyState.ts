export const EVALUATOR_EMPTY_STATE_DOCS_HREF =
  "https://langfuse.com/docs/evaluation/overview";

export const EVALUATOR_EMPTY_STATE_STARTING_POINTS = [
  {
    action: "detect-topics",
    templateKey: "topic-classifier",
    title: "Detect Topics",
    description:
      "Classify the requests going through your system to better understand volumes of different categories.",
  },
  {
    action: "select-template",
    templateKey: "user-disagreement",
  },
  {
    action: "select-template",
    templateKey: "topic-decision-model",
  },
] as const;
