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
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
});

export const AnnotationQueueActionConfigSchema = z.object({
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
