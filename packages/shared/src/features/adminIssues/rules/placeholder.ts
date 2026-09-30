import type { AdminIssueDefinition } from "../adminIssueDefinitions";

export const placeholderRule: AdminIssueDefinition = {
  id: "placeholder",
  name: "Placeholder",
  group: "integration",
  callback: async () => [],
};
