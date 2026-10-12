export const EVALUATOR_ASSISTANT_LANDING_CONFIG = {
  create: {
    title: "Create an evaluator with the Assistant",
    description:
      "Start with your evaluation goal. The Assistant will clarify the model and data scope before creating or testing anything.",
    examples: [
      {
        id: "helpfulness",
        label: "Score how helpful each answer is",
        prompt: "Score how helpful each answer is",
      },
      {
        id: "groundedness",
        label: "Check whether answers are grounded in context",
        prompt: "Check whether answers are grounded in the retrieved context",
      },
      {
        id: "classification",
        label: "Classify responses by support topic",
        prompt: "Classify responses by support topic",
      },
    ],
    placeholder: "Describe what you want to evaluate...",
  },
  edit: {
    title: "Improve this evaluator with the Assistant",
    description:
      "Describe the change. The Assistant will clarify the goal, model, and data scope before updating or testing the evaluator.",
    examples: [
      {
        id: "strict",
        label: "Make the evaluation criterion stricter",
        prompt: "Make the evaluation criterion stricter",
      },
      {
        id: "scope",
        label: "Evaluate only production observations",
        prompt: "Evaluate only production observations",
      },
      {
        id: "reason",
        label: "Add a short reason to every score",
        prompt: "Add a short reason to every score",
      },
    ],
    placeholder: "Describe how to improve this evaluator...",
  },
} as const;
