import { z } from "zod/v4";

export const UsageTypeSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const PriceSchema = z.number().nonnegative();
export const TokenizerSchema = z.enum(["openai", "claude"]).nullish();
export const PriceMapSchema = z
  .record(UsageTypeSchema, PriceSchema.optional())
  .transform((obj) => {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, value]) => Boolean(value)),
    );
  })
  .pipe(z.record(UsageTypeSchema, PriceSchema));

export const GetModelResultSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  modelName: z.string(),
  matchPattern: z.string(),
  tokenizerConfig: z.union([
    z.record(z.string(), z.union([z.string(), z.coerce.number()])).nullable(),
    z.string(),
  ]),
  tokenizerId: TokenizerSchema,
  prices: PriceMapSchema,
  lastUsed: z.date().nullish(),
});

export type GetModelResult = z.infer<typeof GetModelResultSchema>;

export const UpsertModelSchema = z.object({
  modelId: z.string().nullable(),
  projectId: z.string(),
  modelName: z.string().min(1),
  matchPattern: z.string().min(1),
  tokenizerId: z
    .enum(["openai", "claude", "None"])
    .nullish()
    .transform((value) => {
      return value === "None" ? null : value;
    })
    .pipe(TokenizerSchema.nullish()),
  tokenizerConfig: z
    .record(z.string(), z.union([z.string(), z.coerce.number()]))
    .optional(),
  prices: PriceMapSchema,
});
export type UpsertModel = z.infer<typeof UpsertModelSchema>;

export const FormUpsertModelSchema = z.object({
  modelName: z.string().min(1),
  matchPattern: z.string().min(1),
  tokenizerId: z.enum(["openai", "claude", "None"]).nullish(),
  tokenizerConfig: z
    .string()
    .refine(
      (value) => {
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      },
      {
        message: "Tokenizer config needs to be valid JSON",
      },
    )
    .transform((value) => (value === "{}" ? undefined : value))
    .nullish(),
  prices: PriceMapSchema,
});
export type FormUpsertModel = z.infer<typeof FormUpsertModelSchema>;

export enum PriceUnit {
  PerUnit = "per unit",
  Per1KUnits = "per 1K units",
  Per1MUnits = "per 1M units",
}

export const ModelLastUsedQueryResult = z.array(
  z.object({
    modelId: z.string(),
    lastUsed: z.coerce.date(),
  }),
);
