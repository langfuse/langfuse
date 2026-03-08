import { type JiraActionConfig } from "@langfuse/shared";
import type { WebhookInput } from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";

export type JiraIssuePayload = {
  fields: {
    project: { key: string };
    summary: string;
    issuetype: { name: string };
    description: {
      type: "doc";
      version: 1;
      content: Array<{
        type: "paragraph";
        content: Array<{ type: "text"; text: string }>;
      }>;
    };
    labels?: string[];
    assignee?: { accountId: string };
  };
};

export function buildJiraIssuePayload({
  config,
  input,
}: {
  config: JiraActionConfig;
  input: WebhookInput;
}): { payload: JiraIssuePayload; authHeader: string; url: string } {
  let summary: string;
  let description: string;

  if (input.payload.type === "metric-alert") {
    const p = input.payload;
    summary = `[Langfuse Alert] ${p.metric} threshold breached`;
    description =
      `Metric: ${p.metric}\n` +
      `Value: ${p.value}\n` +
      `Threshold: ${p.operator} ${p.threshold}\n` +
      `Lookback Window: ${p.lookbackWindowMinutes}m\n` +
      `Triggered At: ${p.triggeredAt}\n` +
      `Project ID: ${input.projectId}`;
  } else {
    const p = input.payload;
    summary = `[Langfuse] Prompt ${p.prompt.name} v${p.prompt.version} ${p.action}`;
    description =
      `Prompt: ${p.prompt.name}\n` +
      `Version: ${p.prompt.version}\n` +
      `Action: ${p.action}\n` +
      `Project ID: ${input.projectId}`;
  }

  const payload: JiraIssuePayload = {
    fields: {
      project: { key: config.projectKey },
      summary,
      issuetype: { name: config.issueType },
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: description }],
          },
        ],
      },
      ...(config.labels?.length ? { labels: config.labels } : {}),
      ...(config.assigneeAccountId
        ? { assignee: { accountId: config.assigneeAccountId } }
        : {}),
    },
  };

  const decryptedToken = decrypt(config.apiToken);
  const credentials = Buffer.from(`${config.email}:${decryptedToken}`).toString(
    "base64",
  );

  return {
    payload,
    authHeader: `Basic ${credentials}`,
    url: `${config.jiraBaseUrl.replace(/\/$/, "")}/rest/api/3/issue`,
  };
}
