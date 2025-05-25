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

export const WebhookActionConfigSchema = z.object({
  type: z.literal("webhook"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
});

export const AnnotationQueueActionConfigSchema = z.object({
  type: z.literal("annotation-queue"),
  queueId: z.string(),
});

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
