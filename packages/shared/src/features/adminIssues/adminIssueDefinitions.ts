import { placeholderRule } from "./rules/placeholder";

export type RuleIssue = {
  description: string;
  /** 0 is highest priority, 5 is lowest. */
  priority: 0 | 1 | 2 | 3 | 4 | 5;
  ctaLink?: string;
};

export type AdminIssueDefinition = {
  id: string;
  name: string;
  group: "integration" | "sdks";
  callback?: (projectId: string) => Promise<RuleIssue[]>;
};

export const adminIssueDefinitions: AdminIssueDefinition[] = [placeholderRule];
