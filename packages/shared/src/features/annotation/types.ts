import z from "zod";

const configCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export const categoriesList = z.array(configCategory);

export type ConfigCategory = z.infer<typeof configCategory>;
