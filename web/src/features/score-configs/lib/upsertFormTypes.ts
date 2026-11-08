import {
  SCORE_CONFIG_NAME_MAX_LENGTH,
  ScoreConfigCategory,
} from "@langfuse/shared";
import { z } from "zod";

export const createConfigSchema = z.object({
  name: z.string().min(1).max(SCORE_CONFIG_NAME_MAX_LENGTH),
  description: z.string().optional(),
  dataType: z.enum(["CATEGORICAL", "NUMERIC", "BOOLEAN", "TEXT"]),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(ScoreConfigCategory).optional(),
});

export const updateConfigSchema = createConfigSchema.extend({
  id: z.string(),
});

export type CreateConfig = z.infer<typeof createConfigSchema>;
export type UpdateConfig = z.infer<typeof updateConfigSchema>;
