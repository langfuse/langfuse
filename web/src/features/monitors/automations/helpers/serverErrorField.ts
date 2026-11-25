import { type MonitorAutomationFormValues } from "./monitorAutomationFormSchema";

/** serverErrorField picks the field a server rejection is about, falling back to the whole form. */
export function serverErrorField(
  actionType: MonitorAutomationFormValues["actionType"],
  message: string,
): ServerErrorField {
  return actionFieldFor(actionType, message) ?? "root.server";
}

/** actionFieldFor matches the rejection message against the selected action's fields. */
function actionFieldFor(
  actionType: MonitorAutomationFormValues["actionType"],
  message: string,
): ServerErrorField | undefined {
  switch (actionType) {
    case "SLACK":
      if (/channel/i.test(message)) return "slack.channelId";
      return undefined;
    case "WEBHOOK":
      if (/header/i.test(message)) return undefined;
      if (/url|host|dns/i.test(message)) return "webhook.url";
      return undefined;
    case "GITHUB_DISPATCH":
      if (/token/i.test(message)) return "githubDispatch.githubToken";
      if (/event type/i.test(message)) return "githubDispatch.eventType";
      if (/url|host|dns/i.test(message)) return "githubDispatch.url";
      return undefined;
    case "PAGERDUTY":
      if (/routing key|integration key/i.test(message)) {
        return "pagerDuty.routingKey";
      }
      return undefined;
  }
}

/** ServerErrorField is a form field a server rejection can be shown under. */
type ServerErrorField =
  | "root.server"
  | "slack.channelId"
  | "webhook.url"
  | "githubDispatch.url"
  | "githubDispatch.eventType"
  | "githubDispatch.githubToken"
  | "pagerDuty.routingKey";
