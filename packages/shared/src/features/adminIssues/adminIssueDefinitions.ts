import type { AdminIssueDefinition } from "./adminIssueDefinition";

export const adminIssueDefinitions: Record<string, AdminIssueDefinition> = {
  placeholder: {
    id: "placeholder",
    name: "Placeholder",
    group: "integration",
    callback: async () => [],
  },
};
