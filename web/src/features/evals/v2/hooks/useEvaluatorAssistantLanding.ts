import { useEffect, useRef } from "react";

import {
  activateInAppAgentContextualLanding,
  registerInAppAgentContextualLanding,
  type InAppAgentContextualLanding,
} from "@/src/features/in-app-agent";

const CREATE_CODE_EXAMPLES = [
  {
    id: "groundedness",
    label: "Fail when the answer contradicts the retrieved context",
    prompt: "Fail when the answer contradicts the retrieved context",
  },
  {
    id: "facts",
    label: "Check the answer only uses facts from retrieved documents",
    prompt: "Check the answer only uses facts from the retrieved documents",
  },
  {
    id: "classification",
    label: "Classify each response into a support topic",
    prompt:
      "Classify each response into one topic: support, billing, technical, sales, or feedback",
  },
] as const;

const CREATE_JUDGE_EXAMPLES = [
  {
    id: "helpfulness",
    label: "Score helpfulness from 1–5 with a short reason",
    prompt: "Score helpfulness from 1–5 with a one-sentence reason",
  },
  {
    id: "groundedness",
    label: "Judge whether the answer is grounded in the context",
    prompt: "Judge whether the answer is grounded in the retrieved context",
  },
  {
    id: "tone",
    label: "Check whether the answer is clear and professional",
    prompt: "Check whether the answer is clear and professional",
  },
] as const;

const EDIT_CODE_EXAMPLES = [
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
] as const;

const EDIT_JUDGE_EXAMPLES = [
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
] as const;

export function getEvaluatorAssistantLanding({
  id,
  mode,
  evaluatorType,
  onSubmit,
}: {
  id: string;
  mode: "create" | "edit";
  evaluatorType: "CODE" | "LLM_AS_JUDGE";
  onSubmit: (input: string) => Promise<boolean>;
}): InAppAgentContextualLanding {
  if (mode === "create" && evaluatorType === "CODE") {
    return {
      id,
      title: "Create a code evaluator with AI",
      description:
        "Describe what to evaluate. The Assistant will create the evaluator and help you test it.",
      examples: CREATE_CODE_EXAMPLES,
      placeholder: "Describe what this code evaluator should check...",
      onSubmit,
    };
  }

  if (mode === "create") {
    return {
      id,
      title: "Create an LLM-as-a-judge evaluator with AI",
      description:
        "Describe your evaluation criteria. The Assistant will create the judge and help you test it.",
      examples: CREATE_JUDGE_EXAMPLES,
      placeholder: "Describe what this judge should evaluate...",
      onSubmit,
    };
  }

  if (evaluatorType === "CODE") {
    return {
      id,
      title: "Improve this code evaluator",
      description:
        "Describe what should change. The Assistant will update the saved evaluator for you to review.",
      examples: EDIT_CODE_EXAMPLES,
      placeholder: "Describe how to change this code evaluator...",
      onSubmit,
    };
  }

  return {
    id,
    title: "Improve this LLM-as-a-judge evaluator",
    description:
      "Describe what should change. The Assistant will update the saved evaluator for you to review.",
    examples: EDIT_JUDGE_EXAMPLES,
    placeholder: "Describe how to change this judge...",
    onSubmit,
  };
}

export function useEvaluatorAssistantLanding({
  projectId,
  landing,
}: {
  projectId: string;
  landing: InAppAgentContextualLanding | null;
}) {
  const onSubmitRef = useRef(landing?.onSubmit);
  onSubmitRef.current = landing?.onSubmit;

  useEffect(() => {
    if (!landing) {
      return;
    }

    return registerInAppAgentContextualLanding(projectId, {
      ...landing,
      onSubmit: (input) =>
        onSubmitRef.current?.(input) ?? Promise.resolve(false),
    });
  }, [
    landing?.description,
    landing?.examples,
    landing?.id,
    landing?.placeholder,
    landing?.title,
    projectId,
  ]);

  return () =>
    landing
      ? activateInAppAgentContextualLanding(projectId, landing.id)
      : false;
}
