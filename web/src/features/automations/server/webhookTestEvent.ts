import { randomUUID } from "node:crypto";
import {
  EventActionSchema,
  ProjectNotificationEventTypeSchema,
  PromptWebhookOutboundSchema,
  SkillWebhookOutboundSchema,
  TriggerEventSource,
  type AutomationDomain,
  type WebhookActionConfigWithSecrets,
} from "@langfuse/shared";
import { EvaluatorBlockReason } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { MonitorWebhookQueueEventSchema } from "@langfuse/shared/monitors/server";
import {
  buildWebhookRequestHeaders,
  fetchWithSecureRedirects,
  ProjectNotificationWebhookQueueEventSchema,
  validateWebhookURL,
  WEBHOOK_URL_VALIDATION_LOG_CONTEXT,
  webhookWhitelistFromEnv,
} from "@langfuse/shared/src/server";

function buildTestEvent(
  trigger: AutomationDomain["trigger"],
  projectId: string,
) {
  const timestamp = new Date();
  const envelope = {
    id: `test-${randomUUID()}`,
    timestamp,
    apiVersion: "v1",
  };
  const resource = {
    id: envelope.id,
    projectId,
    createdBy: "test-user",
    name: "webhook-test",
    version: 1,
    labels: [],
    tags: [],
    commitMessage: "Langfuse webhook test event",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const action = EventActionSchema.safeParse(trigger.eventActions[0]).data;

  switch (trigger.eventSource) {
    case TriggerEventSource.Prompt:
      return PromptWebhookOutboundSchema.parse({
        ...envelope,
        type: "prompt-version",
        action,
        prompt: {
          ...resource,
          type: "text",
          prompt: "Langfuse webhook test event",
          config: {},
        },
      });
    case TriggerEventSource.Skill:
      return SkillWebhookOutboundSchema.parse({
        ...envelope,
        type: "skill-version",
        action,
        skill: {
          ...resource,
          description: "Langfuse webhook test event",
          frontmatter: {},
          files: [],
        },
      });
    case TriggerEventSource.Monitor:
      return MonitorWebhookQueueEventSchema.parse({
        ...envelope,
        type: "monitor-alert",
        payload: {
          monitorId: envelope.id,
          projectId,
          message: {
            title: "Langfuse webhook test event",
            body: "This is a sample monitor alert.",
          },
          severity: "ALERT",
          timestamp,
          fromTimestamp: new Date(timestamp.getTime() - 300_000),
          toTimestamp: timestamp,
          view: "observations",
          filters: [],
          window: "5m",
        },
      });
    case TriggerEventSource.ProjectNotification: {
      const eventType = ProjectNotificationEventTypeSchema.parse(
        trigger.eventActions[0],
      );
      return ProjectNotificationWebhookQueueEventSchema.parse({
        ...envelope,
        type: "project-notification",
        event: {
          eventType,
          severity: "ALERT",
          projectId,
          projectName: "Test project",
          resourceId: envelope.id,
          resourceName: "Test resource",
          message: "Langfuse webhook test event",
          ...(eventType === "evaluator-blocked"
            ? { blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID }
            : {}),
        },
      });
    }
  }
}

export async function sendWebhookTestEvent({
  config,
  trigger,
  projectId,
}: {
  config: WebhookActionConfigWithSecrets;
  trigger: AutomationDomain["trigger"];
  projectId: string;
}) {
  const event = buildTestEvent(trigger, projectId);
  let body: string;
  if (event.type === "prompt-version") {
    // Match the production prompt envelope, which places the prompt last.
    const { prompt, ...envelope } = event;
    body = JSON.stringify({ ...envelope, prompt });
  } else {
    body = JSON.stringify(event);
  }
  const { headers, sensitiveHeaderNames } = buildWebhookRequestHeaders({
    customHeaders: config.requestHeaders,
    body,
    signingSecret: decrypt(config.secretKey),
  });
  const whitelist = webhookWhitelistFromEnv();
  const start = performance.now();
  await validateWebhookURL(config.url, whitelist);
  const { response } = await fetchWithSecureRedirects(
    config.url,
    { method: "POST", body, headers, signal: AbortSignal.timeout(10_000) },
    {
      maxRedirects: 10,
      redirectValidation: {
        validateUrl: validateWebhookURL,
        whitelist,
        logContext: WEBHOOK_URL_VALIDATION_LOG_CONTEXT,
        addressAttemptTimeoutMs: 2_000,
      },
      additionalSensitiveHeaders: sensitiveHeaderNames,
    },
  );
  const durationMs = Math.round(performance.now() - start);
  await response.body?.cancel().catch(() => undefined);
  return { status: response.status, ok: response.ok, durationMs };
}
