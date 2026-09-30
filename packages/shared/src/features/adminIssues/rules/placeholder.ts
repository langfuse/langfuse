import type { AdminIssueDefinition } from "../adminIssueDefinition";

export const placeholderRule: AdminIssueDefinition = {
  id: "placeholder",
  name: "Placeholder",
  group: "integration",
  callback: async () => [],
};
