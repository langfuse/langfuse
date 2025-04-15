import { singleFilter } from "@langfuse/shared";
import {
  DatasetRunItemUpsertEventSchema,
  TraceQueueEventSchema,
} from "@langfuse/shared/src/server";
import { z } from "zod";

export const WorkflowTriggerEventSchema = z.discriminatedUnion("type", [
  DatasetRunItemUpsertEventSchema.extend({
    type: z.literal("dataset_run_item_upsert"),
  }),
  TraceQueueEventSchema.extend({
    type: z.literal("trace_upsert"),
  }),
]);

export type SourceEvent = z.infer<typeof WorkflowTriggerEventSchema>;

export type SourceEventTypes = SourceEvent["type"];

export const FiltersSchema = z.array(singleFilter);
export type Filters = z.infer<typeof FiltersSchema>;
