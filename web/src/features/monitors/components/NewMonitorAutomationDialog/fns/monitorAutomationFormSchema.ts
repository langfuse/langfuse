import { z } from "zod";

import {
  ActionTypeSchema,
  PagerDutyActionCreateSchema,
  WebhookProtectedHeaders,
} from "@langfuse/shared";

const maxNameLength = 100;
const maxEventTypeLength = 100;
// Chromium's URL parser percent-encodes invalid hosts instead of rejecting them.
const urlSchema = z.url({ hostname: z.regexes.hostname });
const httpsUrlSchema = z.url({
  protocol: /^https$/,
  hostname: z.regexes.hostname,
});
const pagerDutyRoutingKeySchema =
  PagerDutyActionCreateSchema.shape.routingKey.unwrap();

/** monitorAutomationFormSchema validates the format of the active action's fields; completeness is gated by the submit button. */
export const monitorAutomationFormSchema = z
  .object({
    name: z
      .string()
      .max(maxNameLength, `Name must be ${maxNameLength} characters or less.`),
    actionType: ActionTypeSchema,
    slack: z.object({ channelId: z.string(), channelName: z.string() }),
    webhook: z.object({
      url: z.string(),
      headers: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          isSecret: z.boolean(),
        }),
      ),
    }),
    githubDispatch: z.object({
      url: z.string(),
      eventType: z.string(),
      githubToken: z.string(),
    }),
    pagerDuty: z.object({
      routingKey: z.string(),
      region: PagerDutyActionCreateSchema.shape.region,
    }),
  })
  .superRefine((values, ctx) => {
    for (const issue of activeActionIssues(values)) ctx.addIssue(issue);
  });

/** defaultMonitorAutomationFormValues is an empty form for the given action. */
export function defaultMonitorAutomationFormValues(
  actionType: MonitorAutomationFormValues["actionType"],
  name = "",
): MonitorAutomationFormValues {
  return {
    name,
    actionType,
    slack: { channelId: "", channelName: "" },
    webhook: { url: "", headers: [] },
    githubDispatch: { url: "", eventType: "", githubToken: "" },
    pagerDuty: { routingKey: "", region: "US" },
  };
}

/** activeActionIssues lists the format issues of the fields the selected action submits. */
function activeActionIssues(values: MonitorAutomationFormValues): FormIssue[] {
  switch (values.actionType) {
    case "WEBHOOK":
      return webhookIssues(values.webhook);
    case "GITHUB_DISPATCH":
      return githubDispatchIssues(values.githubDispatch);
    case "PAGERDUTY":
      return pagerDutyIssues(values.pagerDuty);
    case "SLACK":
      return [];
  }
}

/** webhookIssues checks the URL and the custom headers. */
function webhookIssues(
  webhook: MonitorAutomationFormValues["webhook"],
): FormIssue[] {
  const headerIssues = webhookHeaderIssues(webhook.headers);
  if (isHttpsUrl(webhookUrl(webhook.url))) return headerIssues;
  return [
    issue(["webhook", "url"], "Enter a valid HTTPS URL."),
    ...headerIssues,
  ];
}

/** webhookHeaderIssues checks each partly filled header row; fully empty rows are dropped on submit. */
function webhookHeaderIssues(
  headers: MonitorAutomationFormValues["webhook"]["headers"],
): FormIssue[] {
  const seenNames = new Set<string>();
  return headers.flatMap((header, index) => {
    const name = header.name.trim().toLowerCase();
    const path = (field: "name" | "value") => [
      "webhook",
      "headers",
      index,
      field,
    ];
    if (!name && !header.value.trim()) return [];
    if (!name) return [issue(path("name"), "Header name is required.")];
    if (WebhookProtectedHeaders.includes(name)) {
      return [issue(path("name"), "This header is added by Langfuse.")];
    }
    if (seenNames.has(name)) {
      return [issue(path("name"), "Header names must be unique.")];
    }
    seenNames.add(name);
    if (!header.value.trim()) {
      return [issue(path("value"), "Header value is required.")];
    }
    return [];
  });
}

/** githubDispatchIssues checks the dispatch URL and the event type length. */
function githubDispatchIssues(
  githubDispatch: MonitorAutomationFormValues["githubDispatch"],
): FormIssue[] {
  const issues: FormIssue[] = [];
  if (!urlSchema.safeParse(githubDispatch.url.trim()).success) {
    issues.push(
      issue(
        ["githubDispatch", "url"],
        "Enter a valid repository dispatch URL.",
      ),
    );
  }
  if (githubDispatch.eventType.trim().length > maxEventTypeLength) {
    issues.push(
      issue(
        ["githubDispatch", "eventType"],
        `Event type must be ${maxEventTypeLength} characters or less.`,
      ),
    );
  }
  return issues;
}

/** pagerDutyIssues checks the routing key against PagerDuty's key format. */
function pagerDutyIssues(
  pagerDuty: MonitorAutomationFormValues["pagerDuty"],
): FormIssue[] {
  const result = pagerDutyRoutingKeySchema.safeParse(pagerDuty.routingKey);
  if (result.success) return [];
  return [
    issue(["pagerDuty", "routingKey"], result.error.issues[0]?.message ?? ""),
  ];
}

/** webhookUrl is the submitted webhook URL for the host and path the user typed. */
export function webhookUrl(hostAndPath: string): string {
  return `https://${hostAndPath.trim()}`;
}

/** isHttpsUrl accepts absolute https URLs with a host. */
function isHttpsUrl(url: string): boolean {
  return httpsUrlSchema.safeParse(url).success;
}

/** issue builds a custom zod issue for a form field. */
function issue(path: (string | number)[], message: string): FormIssue {
  return { code: "custom", path, message };
}

/** MonitorAutomationFormValues is the state of the new monitor automation form. */
export type MonitorAutomationFormValues = z.infer<
  typeof monitorAutomationFormSchema
>;

/** FormIssue is a field error raised by the schema refinement. */
type FormIssue = {
  code: "custom";
  path: (string | number)[];
  message: string;
};
