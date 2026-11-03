import { type ActionTypes } from "@langfuse/shared";

/** actionTypeLabel maps each automation action type to its display name. */
export const actionTypeLabel: Record<ActionTypes, string> = {
  WEBHOOK: "Webhook",
  SLACK: "Slack",
  GITHUB_DISPATCH: "GitHub Dispatch",
  PAGERDUTY: "PagerDuty",
};
