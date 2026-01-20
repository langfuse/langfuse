import { Action, Trigger } from "@prisma/client";
import { FilterState } from "../types";
import { z } from "zod/v4";

export enum TriggerEventSource {
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

export const ActionTypeSchema = z.enum(["WEBHOOK", "SLACK", "GITHUB_DISPATCH"]);

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

export const GitHubDispatchActionConfigSchema = z.object({
  type: z.literal("GITHUB_DISPATCH"),
  url: z.url(),
  eventType: z.string().min(1).max(100),
  githubToken: z.string(),
  displayGitHubToken: z.string(),
  lastFailingExecutionId: z.string().nullish(),
});

export const SafeGitHubDispatchActionConfigSchema =
  GitHubDispatchActionConfigSchema.omit({
    githubToken: true,
  });

export type SafeGitHubDispatchActionConfig = z.infer<
  typeof SafeGitHubDispatchActionConfigSchema
>;

export const GitHubDispatchActionCreateSchema = z.object({
  type: z.literal("GITHUB_DISPATCH"),
  url: z.string().url().optional(), // Optional for updates, validated in helper
  eventType: z.string().min(1).max(100).optional(), // Optional for updates, validated in helper
  githubToken: z.string().optional(), // Optional for updates, validated in helper
});

export type GitHubDispatchActionCreate = z.infer<
  typeof GitHubDispatchActionCreateSchema
>;
export type GitHubDispatchActionConfigWithSecrets = z.infer<
  typeof GitHubDispatchActionConfigSchema
>;

export const ActionConfigSchema = z.discriminatedUnion("type", [
  WebhookActionConfigSchema,
  SlackActionConfigSchema,
  GitHubDispatchActionConfigSchema,
]);

export const ActionCreateSchema = z.discriminatedUnion("type", [
  WebhookActionCreateSchema,
  SlackActionConfigSchema,
  GitHubDispatchActionCreateSchema,
]);

export const SafeActionConfigSchema = z.discriminatedUnion("type", [
  SafeWebhookActionConfigSchema,
  SlackActionConfigSchema,
  SafeGitHubDispatchActionConfigSchema,
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

/**
 * Type guard to check if a config is a valid GitHub dispatch configuration with secrets
 */
export function isGitHubDispatchActionConfig(
  config: unknown,
): config is GitHubDispatchActionConfigWithSecrets {
  return GitHubDispatchActionConfigSchema.safeParse(config).success;
}

/**
 * Type guard to check if an entire action has valid GitHub dispatch configuration
 */
export function isGitHubDispatchAction(action: {
  type: string;
  config: unknown;
}): action is {
  type: "GITHUB_DISPATCH";
  config: GitHubDispatchActionConfigWithSecrets;
} {
  return (
    action.type === "GITHUB_DISPATCH" &&
    isGitHubDispatchActionConfig(action.config)
  );
}

/**
 * Type guard for safe GitHub dispatch config (without secrets)
 */
export function isSafeGitHubDispatchActionConfig(
  config: unknown,
): config is SafeGitHubDispatchActionConfig {
  return SafeGitHubDispatchActionConfigSchema.safeParse(config).success;
}

/**
 * Converts GitHub dispatch config with secrets to safe config by only including allowed fields
 */
export function convertToSafeGitHubDispatchConfig(
  config: GitHubDispatchActionConfigWithSecrets,
): SafeGitHubDispatchActionConfig {
  return {
    type: config.type,
    url: config.url,
    eventType: config.eventType,
    displayGitHubToken: config.displayGitHubToken,
    lastFailingExecutionId: config.lastFailingExecutionId,
  };
}
