import type { AdminIssueDefinition } from "../adminIssueDefinitions";

export const rateLimitExceededRule = {
  id: "rate-limit-exceeded",
  name: "Rate limit exceeded",
  group: "integration",
} as const satisfies AdminIssueDefinition;
