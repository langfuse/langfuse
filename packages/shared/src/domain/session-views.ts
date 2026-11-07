import { z } from "zod";
import { sessionTraceFilterSchema } from "../features/filters/sessionTraceFilters";

export const SessionViewInputSchema = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1).max(200),
  filters: sessionTraceFilterSchema,
  viewMode: z.enum(["conversational", "list"]),
  unmatchedTraces: z.enum(["show", "hide"]),
});

export const SessionViewPreferencesSchema = z.object({
  pinnedViewIds: z.array(z.string()).max(1000),
});
