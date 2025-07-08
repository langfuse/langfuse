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
  config: SafeWebhookActionConfig;
};

export type ActionDomainWithSecrets = Omit<Action, "config"> & {
  config: WebhookActionConfigWithSecrets;
};

export const ActionTypeSchema = z.enum(["WEBHOOK"]);

export const AvailableWebhookApiSchema = z.record(
  z.enum(["prompt"]),
  z.enum(["v1"]),
);

export const WebhookActionConfigSchema = z.object({
  type: z.literal("WEBHOOK"),
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  apiVersion: AvailableWebhookApiSchema,
  secretKey: z.string(),
  displaySecretKey: z.string(),
});

export const SafeWebhookActionConfigSchema = WebhookActionConfigSchema.omit({
  secretKey: true,
});

export type SafeWebhookActionConfig = z.infer<
  typeof SafeWebhookActionConfigSchema
>;

export const WebhookActionCreateSchema = WebhookActionConfigSchema.omit({
  secretKey: true,
  displaySecretKey: true,
});

export const ActionConfigSchema = z.discriminatedUnion("type", [
  WebhookActionConfigSchema,
]);

export const ActionCreateSchema = z.discriminatedUnion("type", [
  WebhookActionCreateSchema,
]);

export type ActionTypes = z.infer<typeof ActionTypeSchema>;
export type ActionConfig = z.infer<typeof ActionConfigSchema>;
export type ActionCreate = z.infer<typeof ActionCreateSchema>;

export type WebhookActionConfigWithSecrets = z.infer<
  typeof WebhookActionConfigSchema
>;
