import { prisma } from "../../../db";
import { buildEvalsPath } from "../../../utils/productUrl";
import type { AdminIssueDefinition } from "../adminIssueDefinitions";

export const llmJudgeWithoutDecisionModelRule = {
  id: "llm-judge-without-decision-model",
  name: "Try a decision model",
  group: "evaluations",
  callback: async (projectId) => {
    const judge = await prisma.evaluator.findFirst({
      where: { projectId, type: "LLM_AS_JUDGE" },
      select: { id: true },
    });
    if (!judge) return [];

    const decisionModel = await prisma.evaluator.findFirst({
      where: { projectId, type: "DECISION_MODEL" },
      select: { id: true },
    });
    if (decisionModel) return [];

    return [
      {
        description:
          "You use LLM-as-a-judge evaluators. Try Jev-as-a-judge with a decision model for faster, cheaper evaluations. [Learn why](https://langfuse.com/docs/evaluation/evaluation-methods/jev-as-a-judge#why-use-jev-as-a-judge).",
        priority: 5,
        ctaLink: buildEvalsPath({ projectId }),
      },
    ];
  },
} as const satisfies AdminIssueDefinition;
