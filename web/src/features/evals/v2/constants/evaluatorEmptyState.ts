export const EVALUATOR_EMPTY_STATE_DOCS_HREF =
  "https://langfuse.com/docs/evaluation/overview";

export const DETECT_TOPICS_ASSISTANT_PROMPT =
  "Identify 5-10 common topics in my traces and create a categorical LLM as a judge evaluator running on root observations of my traces. Make sure to add a 'other' category as well";

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
] as const;
