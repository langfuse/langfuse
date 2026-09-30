import { observationsWithoutEvaluatorsRule } from "./rules/observationsWithoutEvaluators";

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
  group: "integration" | "sdks" | "evaluations";
  callback?: (projectId: string) => Promise<RuleIssue[]>;
};

export const adminIssueDefinitions: AdminIssueDefinition[] = [
  observationsWithoutEvaluatorsRule,
];
