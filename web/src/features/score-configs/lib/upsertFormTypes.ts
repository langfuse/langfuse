import { availableDataTypes, ScoreConfigCategory } from "@langfuse/shared";
import { z } from "zod/v4";

export const createConfigSchema = z.object({
  name: z.string().min(1).max(35),
  description: z.string().optional(),
  dataType: z.enum(availableDataTypes),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(ScoreConfigCategory).optional(),
});

export const updateConfigSchema = createConfigSchema.extend({
  id: z.string(),
});

export type CreateConfig = z.infer<typeof createConfigSchema>;
export type UpdateConfig = z.infer<typeof updateConfigSchema>;
