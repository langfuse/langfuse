import {
  type ModelUsageUnit as PrismaModelUsageUnit,
  paginationMetaResponseZod,
  paginationZod,
  type Model as PrismaModel,
  jsonSchema,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */

const APIModelUsageUnit = z.enum([
  "TOKENS",
  "CHARACTERS",
  "MILLISECONDS",
  "SECONDS",
  "REQUESTS",
  "IMAGES",
]);

const APIModelDefinition = z
  .object({
    id: z.string(),
    modelName: z.string(),
    matchPattern: z.string(),
    startDate: z.coerce.date().nullable(),
    inputPrice: z.number().nonnegative().nullable(),
    outputPrice: z.number().nonnegative().nullable(),
    totalPrice: z.number().nonnegative().nullable(),
    unit: APIModelUsageUnit,
    tokenizerId: z.string().nullable(),
    tokenizerConfig: z.any(), // Assuming Prisma.JsonValue is any type
    isLangfuseManaged: z.boolean(),
    createdAt: z.coerce.date(),
  })
  .strict();

/**
 * Transforms
 */

export function prismaToApiModelDefinition({
  projectId,
  inputPrice,
  outputPrice,
  totalPrice,
  unit,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updatedAt,
  ...model
}: PrismaModel): z.infer<typeof APIModelDefinition> {
  return {
    ...model,
    unit: unit as PrismaModelUsageUnit,
    inputPrice: inputPrice?.toNumber() ?? null,
    outputPrice: outputPrice?.toNumber() ?? null,
    totalPrice: totalPrice?.toNumber() ?? null,
    isLangfuseManaged: !Boolean(projectId),
  };
}

/**
 * Endpoints
 */

// GET /models
export const GetModelsV1Query = z.object({
  ...paginationZod,
});
export const GetModelsV1Response = z
  .object({
    data: z.array(APIModelDefinition),
    meta: paginationMetaResponseZod,
  })
  .strict();

// POST /models
export const PostModelsV1Body = z
  .object({
    modelName: z.string(),
    matchPattern: z.string(),
    startDate: z.coerce.date().nullish(),
    inputPrice: z.number().nonnegative().nullish(),
    outputPrice: z.number().nonnegative().nullish(),
    totalPrice: z.number().nonnegative().nullish(),
    unit: APIModelUsageUnit,
    tokenizerId: z.enum(["openai", "claude"]).nullish(),
    tokenizerConfig: jsonSchema.nullish(), // Assuming Prisma.JsonValue is any type
  })
  .refine(
    ({ inputPrice, outputPrice, totalPrice }) => {
      if (inputPrice || outputPrice) {
        return !totalPrice;
      }
      return true;
    },
    {
      path: ["totalPrice"],
      message: "If input and/or output price is set, total price must be null",
    },
  );
export const PostModelsV1Response = APIModelDefinition.strict();

// GET /models/{modelId}
export const GetModelV1Query = z.object({
  modelId: z.string(),
});
export const GetModelV1Response = APIModelDefinition.strict();

// DELETE /models/{modelId}
export const DeleteModelV1Query = z.object({
  modelId: z.string(),
});
export const DeleteModelV1Response = z
  .object({
    message: z.literal("Model successfully deleted"),
  })
  .strict();
