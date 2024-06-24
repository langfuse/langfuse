import z from "zod";
import { ScoreConfig } from "../../db";

const configCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export const categoriesList = z.array(configCategory);

export type ConfigCategory = z.infer<typeof configCategory>;

export type CastedConfig = Omit<ScoreConfig, "categories"> & {
  categories: ConfigCategory[] | null;
};
