import { TriggerEventSource, type ActionCreate } from "@langfuse/shared";

import { type RouterInputs } from "@/src/utils/api";
import {
  httpsUrl,
  type MonitorAutomationFormValues,
} from "./monitorAutomationFormSchema";

/** buildCreateMonitorAutomationInput maps the form to an active monitor-triggered automation. */
export function buildCreateMonitorAutomationInput(
  projectId: string,
  values: MonitorAutomationFormValues,
): RouterInputs["automations"]["createAutomation"] {
  return {
    projectId,
    name: values.name.trim(),
    eventSource: TriggerEventSource.Monitor,
    eventAction: [],
    filter: null,
    status: "ACTIVE",
    actionType: values.actionType,
    actionConfig: buildActionConfig(values),
  };
}

/** buildActionConfig builds the config of the selected action. */
function buildActionConfig(values: MonitorAutomationFormValues): ActionCreate {
  switch (values.actionType) {
    case "SLACK":
      return {
        type: "SLACK",
        channelId: values.slack.channelId,
        channelName: values.slack.channelName,
      };
    case "WEBHOOK":
      return {
        type: "WEBHOOK",
        url: httpsUrl(values.webhook.url),
        requestHeaders: requestHeaders(values.webhook.headers),
        apiVersion: { monitor: "v1" },
      };
    case "GITHUB_DISPATCH":
      return {
        type: "GITHUB_DISPATCH",
        url: httpsUrl(values.githubDispatch.url),
        eventType: values.githubDispatch.eventType.trim(),
        githubToken: values.githubDispatch.githubToken.trim(),
      };
    case "PAGERDUTY":
      return {
        type: "PAGERDUTY",
        region: values.pagerDuty.region,
        routingKey: values.pagerDuty.routingKey.trim(),
      };
  }
}

/** requestHeaders keys the named custom headers by trimmed name. */
function requestHeaders(
  headers: MonitorAutomationFormValues["webhook"]["headers"],
): Record<string, { secret: boolean; value: string }> {
  return Object.fromEntries(
    headers
      .filter((header) => header.name.trim())
      .map((header) => [
        header.name.trim(),
        { secret: header.isSecret, value: header.value.trim() },
      ]),
  );
}
