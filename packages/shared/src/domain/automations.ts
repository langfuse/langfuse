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
  actionIds: string[];
};

// Zod schema for ActionType enum
export const ActionTypeSchema = z.enum(["WEBHOOK", "ANNOTATION_QUEUE"]);

export const WebhookActionConfigSchema = z.object({
  type: z.literal("WEBHOOK"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
});

export const ActionConfigSchema = z.discriminatedUnion("type", [
  WebhookActionConfigSchema,
]);

export type ActionTypes = z.infer<typeof ActionTypeSchema>;
export type ActionConfig = z.infer<typeof ActionConfigSchema>;

export type WebhookActionConfig = z.infer<typeof WebhookActionConfigSchema>;

export type ActionDomain = Omit<Action, "config"> & {
  config: WebhookActionConfig;
  triggerIds: string[];
};

export type AutomationIdentifier = {
  triggerId: string;
  actionId: string;
};
