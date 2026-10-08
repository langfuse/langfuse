export const EVALUATOR_ASSISTANT_LANDING_CONFIG = {
  create: {
    CODE: {
      title: "Create a code evaluator with AI",
      description:
        "Describe what to evaluate. The Assistant will create the evaluator and help you test it.",
      examples: [
        {
          id: "groundedness",
          label: "Fail when the answer contradicts the retrieved context",
          prompt: "Fail when the answer contradicts the retrieved context",
        },
        {
          id: "facts",
          label: "Check the answer only uses facts from retrieved documents",
          prompt:
            "Check the answer only uses facts from the retrieved documents",
        },
        {
          id: "classification",
          label: "Classify each response into a support topic",
          prompt:
            "Classify each response into one topic: support, billing, technical, sales, or feedback",
        },
      ],
      placeholder: "Describe what this code evaluator should check...",
    },
    LLM_AS_JUDGE: {
      title: "Create an LLM-as-a-judge evaluator with AI",
      description:
        "Describe your evaluation criteria. The Assistant will create the judge and help you test it.",
      examples: [
        {
          id: "helpfulness",
          label: "Score helpfulness from 1–5 with a short reason",
          prompt: "Score helpfulness from 1–5 with a one-sentence reason",
        },
        {
          id: "groundedness",
          label: "Judge whether the answer is grounded in the context",
          prompt:
            "Judge whether the answer is grounded in the retrieved context",
        },
        {
          id: "tone",
          label: "Check whether the answer is clear and professional",
          prompt: "Check whether the answer is clear and professional",
        },
      ],
      placeholder: "Describe what this judge should evaluate...",
    },
    DECISION_MODEL: {
      title: "Create a decision model evaluator with AI",
      description:
        "Describe which observations and structured decisions to evaluate. The Assistant will inspect samples, configure the evaluator, and test it.",
      examples: [
        {
          id: "support-routing",
          label: "Classify support requests and flag urgent cases",
          prompt:
            "For support-request generations, classify the topic and decide whether the case is urgent",
        },
        {
          id: "response-review",
          label: "Check policy compliance and response completeness",
          prompt:
            "For customer-support generations, decide whether the response follows policy and fully answers the request",
        },
      ],
      placeholder:
        "Describe the observations and structured decisions to evaluate...",
    },
  },
  edit: {
    CODE: {
      title: "Improve this code evaluator",
      description:
        "Describe what should change. The Assistant will update the saved evaluator for you to review.",
      examples: [
        {
          id: "empty-output",
          label: "Also fail when the output is empty",
          prompt: "Also fail when the output is empty",
        },
        {
          id: "strict",
          label: "Make the evaluation criterion stricter",
          prompt: "Make the evaluation criterion stricter",
        },
        {
          id: "reason",
          label: "Add a short explanation for every score",
          prompt: "Add a short explanation for every score",
        },
      ],
      placeholder: "Describe how to change this code evaluator...",
    },
    LLM_AS_JUDGE: {
      title: "Improve this LLM-as-a-judge evaluator",
      description:
        "Describe what should change. The Assistant will update the saved evaluator for you to review.",
      examples: [
        {
          id: "strict",
          label: "Make the evaluation criterion stricter",
          prompt: "Make the evaluation criterion stricter",
        },
        {
          id: "scale",
          label: "Change the score to a 1–5 scale",
          prompt: "Change the score to a 1–5 scale",
        },
        {
          id: "reason",
          label: "Add a short explanation for every score",
          prompt: "Add a short explanation for every score",
        },
      ],
      placeholder: "Describe how to change this judge...",
    },
    DECISION_MODEL: {
      title: "Improve this decision model evaluator",
      description:
        "Describe what should change. The Assistant will inspect matching observations, update the saved evaluator, and test it.",
      examples: [
        {
          id: "question",
          label: "Add a decision for whether escalation is required",
          prompt:
            "Add a decision for whether the support request requires escalation",
        },
        {
          id: "scope",
          label: "Limit samples to production support generations",
          prompt:
            "Evaluate only production support generations and keep the existing decisions",
        },
      ],
      placeholder: "Describe how to change this decision model...",
    },
  },
} as const;
