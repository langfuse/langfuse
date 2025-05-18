import { Action, Trigger } from "@prisma/client";
import { FilterState } from "../types";
import { z } from "zod";

export declare enum TriggerEventSource {
  ObservationCreated = "observation.created",
}

export type TriggerDomain = Omit<Trigger, "filter" | "eventSource"> & {
  filter: FilterState;
  eventSource: TriggerEventSource;
};

export const WebhookActionConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
});

export type WebhookActionConfig = z.infer<typeof WebhookActionConfigSchema>;

export type ActionDomain = Omit<Action, "config"> & {
  config: WebhookActionConfig;
};
