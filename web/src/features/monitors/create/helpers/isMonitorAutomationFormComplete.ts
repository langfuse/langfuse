import { type MonitorAutomationFormValues } from "./monitorAutomationFormSchema";

/** isMonitorAutomationFormComplete reports whether the name and the selected action's required fields are filled. */
export function isMonitorAutomationFormComplete(
  values: MonitorAutomationFormValues,
): boolean {
  return isFilled(values.name) && requiredActionFields(values).every(isFilled);
}

/** requiredActionFields lists the values the selected action cannot be created without. */
function requiredActionFields(values: MonitorAutomationFormValues): string[] {
  switch (values.actionType) {
    case "SLACK":
      return [values.slack.channelId];
    case "WEBHOOK":
      return [values.webhook.url];
    case "GITHUB_DISPATCH":
      return [
        values.githubDispatch.url,
        values.githubDispatch.eventType,
        values.githubDispatch.githubToken,
      ];
    case "PAGERDUTY":
      return [values.pagerDuty.routingKey];
  }
}

/** isFilled rejects blank strings. */
function isFilled(value: string): boolean {
  return value.trim().length > 0;
}
