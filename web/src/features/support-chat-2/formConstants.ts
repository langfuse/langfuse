export type MessageType = "Question" | "Feedback" | "Bug";

export const FORM_SECTIONS = ["intro", "form", "success"] as const;

export type FormSection = (typeof FORM_SECTIONS)[number];

export const TOPICS = {
  Operations: [
    "Account Changes",
    "Account Deletion",
    "Billing / Usage",
    "Slack Connect Channel",
    "Inviting Users",
  ],
  "Product Features": ["Tracing", "Prompt Management", "Evals", "Platform"],
} as const;

export const SEVERITIES = [
  "Question or feature request",
  "Feature not working as expected",
  "Feature is not working at all",
  "Outage, data loss, or data breach",
] as const;
