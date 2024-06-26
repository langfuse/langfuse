import z from "zod";
import { ScoreConfig, type ScoreDataType } from "../../db";

const configCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

const NUMERIC: ScoreDataType = "NUMERIC";
const CATEGORICAL: ScoreDataType = "CATEGORICAL";
const BOOLEAN: ScoreDataType = "BOOLEAN";

export const availableDataTypes = [NUMERIC, CATEGORICAL, BOOLEAN] as const;

export const categoriesList = z.array(configCategory);

export type ConfigCategory = z.infer<typeof configCategory>;

export type CastedConfig = Omit<ScoreConfig, "categories"> & {
  categories: ConfigCategory[] | null;
};

export const createConfigSchema = z.object({
  name: z.string().min(1).max(35),
  dataType: z.enum(availableDataTypes),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(configCategory).optional(),
  description: z.string().optional(),
});

export type CreateConfig = z.infer<typeof createConfigSchema>;
