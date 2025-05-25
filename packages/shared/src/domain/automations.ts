import { Action, Trigger } from "@prisma/client";
import { FilterState } from "../types";
import { z } from "zod";

export declare enum TriggerEventSource {
  ObservationCreated = "observation.created",
}

export type TriggerDomain = Omit<Trigger, "filter" | "eventSource"> & {
  filter: FilterState;
  eventSource: TriggerEventSource;
  actionIds: string[];
};

// Zod schema for ActionType enum
export const ActionTypeSchema = z.enum(["WEBHOOK", "ANNOTATION_QUEUE"]);

export const WebhookActionConfigSchema = z.object({
  type: z.literal("WEBHOOK"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
});

export const AnnotationQueueActionConfigSchema = z.object({
  type: z.literal("ANNOTATION_QUEUE"),
  queueId: z.string().min(1, "Queue ID is required"),
});

export const ActionConfigSchema = z.discriminatedUnion("type", [
  WebhookActionConfigSchema,
  AnnotationQueueActionConfigSchema,
]);

export type ActionTypes = z.infer<typeof ActionTypeSchema>;
export type ActionConfig = z.infer<typeof ActionConfigSchema>;

export type WebhookActionConfig = z.infer<typeof WebhookActionConfigSchema>;
export type AnnotationQueueActionConfig = z.infer<
  typeof AnnotationQueueActionConfigSchema
>;

export type ActionDomain = Omit<Action, "config"> & {
  config: WebhookActionConfig | AnnotationQueueActionConfig;
  triggerIds: string[];
};

export type AutomationIdentifier = {
  triggerId: string;
  actionId: string;
};
