import z from "zod";
import { ScoreConfig, ScoreDataType } from "../../db";

const configCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export const categoriesList = z.array(configCategory);

export type ConfigCategory = z.infer<typeof configCategory>;

export type CastedConfig = Omit<ScoreConfig, "categories"> & {
  categories: ConfigCategory[] | null;
};

export const createConfigSchema = z.object({
  name: z.string().min(1).max(35),
  dataType: z.nativeEnum(ScoreDataType),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(configCategory).optional(),
  description: z.string().optional(),
});

export type CreateConfig = z.infer<typeof createConfigSchema>;
