export type MessageType = "Question" | "Feedback" | "Bug";

export const TOPICS = [
  "Billing / Usage",
  "Account Changes",
  "Account Deletion",
  "Slack Connect Channel",
  "Inviting Users",
  "Tracing",
  "Prompt Management",
  "Evals",
  "Platform",
] as const;

export const SEVERITIES = [
  "Question or feature request",
  "Feature not working as expected",
  "Feature is not working at all",
  "Outage, data loss, or data breach",
] as const;
