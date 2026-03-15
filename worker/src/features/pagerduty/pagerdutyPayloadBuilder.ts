import { PagerDutyActionConfig, type AutomationDomain } from "@langfuse/shared";
import type { WebhookInput } from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";

export type PagerDutyPayload = {
  routing_key: string;
  event_action: "trigger";
  dedup_key: string;
  payload: {
    summary: string;
    severity: string;
    source: string;
    component?: string;
    custom_details: Record<string, unknown>;
  };
};

export function buildPagerDutyPayload({
  config,
  input,
  automation,
}: {
  config: PagerDutyActionConfig;
  input: WebhookInput;
  automation: AutomationDomain;
}): PagerDutyPayload {
  const decryptedKey = decrypt(config.integrationKey);

  const p = input.payload;
  const summary = `[Langfuse] Prompt ${p.prompt.name} v${p.prompt.version} ${p.action}`;
  const customDetails: Record<string, unknown> = {
    promptId: p.prompt.id,
    promptName: p.prompt.name,
    promptVersion: p.prompt.version,
    action: p.action,
    projectId: input.projectId,
    automationId: input.automationId,
  };

  return {
    routing_key: decryptedKey,
    event_action: "trigger",
    dedup_key: `langfuse-${input.projectId}-${automation.id}`,
    payload: {
      summary,
      severity: config.severity,
      source: config.source ?? "langfuse",
      ...(config.component ? { component: config.component } : {}),
      custom_details: customDetails,
    },
  };
}
