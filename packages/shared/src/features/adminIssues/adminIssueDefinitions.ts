import { deeplyNestedPromptsRule } from "./rules/deeplyNestedPrompts";
import { llmJudgeWithoutDecisionModelRule } from "./rules/llmJudgeWithoutDecisionModel";
import { observationsWithoutEvaluatorsRule } from "./rules/observationsWithoutEvaluators";
import { oversizedIngestionRequestRule } from "./rules/oversizedIngestionRequest";

export type RuleIssue = {
  /** User-facing Markdown describing the issue and next step. */
  description: string;
  /** 0 is highest priority, 5 is lowest. */
  priority: 0 | 1 | 2 | 3 | 4 | 5;
  ctaLink?: string;
};

export type AdminIssueDefinition = {
  id: string;
  name: string;
  group: "integration" | "sdks" | "evaluations" | "prompts";
  callback?: (projectId: string) => Promise<RuleIssue[]>;
};

export const adminIssueDefinitions = {
  [observationsWithoutEvaluatorsRule.name]: observationsWithoutEvaluatorsRule,
  [deeplyNestedPromptsRule.name]: deeplyNestedPromptsRule,
  [llmJudgeWithoutDecisionModelRule.name]: llmJudgeWithoutDecisionModelRule,
  [oversizedIngestionRequestRule.name]: oversizedIngestionRequestRule,
} as const satisfies Record<string, AdminIssueDefinition>;

export type AdminIssueName = keyof typeof adminIssueDefinitions;
