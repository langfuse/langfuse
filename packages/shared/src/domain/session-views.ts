import { z } from "zod";
import { sessionTraceFilterSchema } from "../features/filters/sessionTraceFilters";

export const SessionViewConfigSchema = z.object({
  filters: sessionTraceFilterSchema,
  viewMode: z.enum(["conversational", "list"]),
  unmatchedTraces: z.enum(["show", "hide"]),
});

export type SessionViewConfig = z.infer<typeof SessionViewConfigSchema>;

export const SessionViewInputSchema = SessionViewConfigSchema.extend({
  projectId: z.string(),
  name: z.string().trim().min(1).max(200),
  ownership: z.enum(["PRIVATE", "PROJECT"]).default("PRIVATE"),
});

export const SessionViewPreferencesSchema = z.object({
  pinnedViewIds: z.array(z.string()).max(1000),
});
