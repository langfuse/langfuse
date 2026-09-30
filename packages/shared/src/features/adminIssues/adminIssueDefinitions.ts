import type { AdminIssueDefinition } from "./adminIssueDefinition";
import { placeholderRule } from "./rules/placeholder";

export const adminIssueDefinitions: Record<string, AdminIssueDefinition> = {
  [placeholderRule.id]: placeholderRule,
};
