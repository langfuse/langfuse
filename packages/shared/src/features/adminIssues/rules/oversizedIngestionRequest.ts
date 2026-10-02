import type { AdminIssueDefinition } from "../adminIssueDefinitions";

export const oversizedIngestionRequestRule = {
  id: "oversized-ingestion-request",
  name: "Oversized ingestion request",
  group: "sdks",
} as const satisfies AdminIssueDefinition;
