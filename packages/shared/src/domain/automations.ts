import { Action, Trigger } from "@prisma/client";
import { FilterState } from "../types";
import { z } from "zod/v4";

export enum TriggerEventSource {
  // eslint-disable-next-line no-unused-vars
  Prompt = "prompt",
}

export const EventActionSchema = z.enum(["created", "updated", "deleted"]);

export type TriggerEventAction = z.infer<typeof EventActionSchema>;

export const TriggerEventSourceSchema = z.enum([TriggerEventSource.Prompt]);

export type TriggerDomain = Omit<
  Trigger,
  "filter" | "eventSource" | "eventActions"
> & {
  filter: FilterState;
  eventSource: TriggerEventSource;
  eventActions: TriggerEventAction[];
};

export type AutomationDomain = {
  id: string;
  name: string;
  trigger: TriggerDomain;
  action: ActionDomain;
};

export type ActionDomain = Omit<Action, "config"> & {
  config: SafeActionConfig;
};

export type ActionDomainWithSecrets = Omit<Action, "config"> & {
  config: ActionConfigWithSecrets;
};

export const ActionTypeSchema = z.enum(["WEBHOOK", "SLACK"]);

export const AvailableWebhookApiSchema = z.record(
  z.enum(["prompt"]),
  z.enum(["v1"]),
);

export const RequestHeaderSchema = z.object({
  secret: z.boolean(),
  value: z.string(),
});

export const WebhookActionConfigSchema = z.object({
  type: z.literal("WEBHOOK"),
  url: z.url(), // Basic URL validation only - manual security validation called separately
  headers: z.record(z.string(), z.string()).optional(), // deprecated field, use requestHeaders instead
  requestHeaders: z.record(z.string(), RequestHeaderSchema).optional(), // might not exist on legacy webhooks
  displayHeaders: z.record(z.string(), RequestHeaderSchema).optional(), // might not exist on legacy webhooks
  apiVersion: AvailableWebhookApiSchema,
  secretKey: z.string(),
  displaySecretKey: z.string(),
  lastFailingExecutionId: z.string().nullish(),
});

export const SafeWebhookActionConfigSchema = WebhookActionConfigSchema.omit({
  secretKey: true,
  headers: true,
  requestHeaders: true,
});

export type SafeWebhookActionConfig = z.infer<
  typeof SafeWebhookActionConfigSchema
>;

export const WebhookActionCreateSchema = WebhookActionConfigSchema.omit({
  secretKey: true,
  displaySecretKey: true,
  headers: true, // don't use legacy field anymore
  displayHeaders: true,
});

export const SlackActionConfigSchema = z.object({
  type: z.literal("SLACK"),
  channelId: z.string(),
  channelName: z.string(),
  messageTemplate: z.string().optional(),
});

export type SlackActionConfig = z.infer<typeof SlackActionConfigSchema>;

export const ActionConfigSchema = z.discriminatedUnion("type", [
  WebhookActionConfigSchema,
  SlackActionConfigSchema,
]);

export const ActionCreateSchema = z.discriminatedUnion("type", [
  WebhookActionCreateSchema,
  SlackActionConfigSchema,
]);

export const SafeActionConfigSchema = z.discriminatedUnion("type", [
  SafeWebhookActionConfigSchema,
  SlackActionConfigSchema,
]);

export type ActionTypes = z.infer<typeof ActionTypeSchema>;
export type ActionConfig = z.infer<typeof ActionConfigSchema>;
export type ActionCreate = z.infer<typeof ActionCreateSchema>;
export type SafeActionConfig = z.infer<typeof SafeActionConfigSchema>;

export type WebhookActionCreate = z.infer<typeof WebhookActionCreateSchema>;
export type WebhookActionConfigWithSecrets = z.infer<
  typeof WebhookActionConfigSchema
>;

export type ActionConfigWithSecrets = z.infer<typeof ActionConfigSchema>;

// Type Guards for Runtime Validation
// Using existing Zod schemas to provide both compile-time and runtime type safety

/**
 * Type guard to check if a config is a valid webhook configuration with secrets
 */
export function isWebhookActionConfig(
  config: unknown,
): config is WebhookActionConfigWithSecrets {
  return WebhookActionConfigSchema.safeParse(config).success;
}

/**
 * Type guard to check if a config is a valid Slack configuration
 */
export function isSlackActionConfig(
  config: unknown,
): config is SlackActionConfig {
  return SlackActionConfigSchema.safeParse(config).success;
}

/**
 * Type guard to check if an entire action has valid webhook configuration
 */
export function isWebhookAction(action: {
  type: string;
  config: unknown;
}): action is { type: "WEBHOOK"; config: WebhookActionConfigWithSecrets } {
  return action.type === "WEBHOOK" && isWebhookActionConfig(action.config);
}

/**
 * Type guard for safe webhook config (without secrets)
 */
export function isSafeWebhookActionConfig(
  config: unknown,
): config is SafeWebhookActionConfig {
  return SafeWebhookActionConfigSchema.safeParse(config).success;
}

/**
 * Converts webhook config with secrets to safe config by only including allowed fields
 */
export function convertToSafeWebhookConfig(
  webhookConfig: WebhookActionConfigWithSecrets,
): SafeWebhookActionConfig {
  return {
    type: webhookConfig.type,
    url: webhookConfig.url,
    displayHeaders: webhookConfig.displayHeaders,
    apiVersion: webhookConfig.apiVersion,
    displaySecretKey: webhookConfig.displaySecretKey,
    lastFailingExecutionId: webhookConfig.lastFailingExecutionId,
  };
}
