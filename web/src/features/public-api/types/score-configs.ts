import {
  BooleanConfigFields,
  CategoricalConfigFields,
  isPresent,
  NumericConfigFields,
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "@langfuse/shared";
import { z } from "zod/v4";

/**
 * Endpoints
 */
const ScoreConfigBase = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  isArchived: z.boolean(),
});

const APIScoreConfig = z
  .discriminatedUnion("dataType", [
    ScoreConfigBase.merge(NumericConfigFields),
    ScoreConfigBase.merge(CategoricalConfigFields),
    ScoreConfigBase.merge(BooleanConfigFields),
  ])
  .superRefine((data, ctx) => {
    if (data.dataType === "NUMERIC") {
      if (
        isPresent(data.maxValue) &&
        isPresent(data.minValue) &&
        data.maxValue <= data.minValue
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum value must be greater than Minimum value",
        });
      }
    }
  });

// GET /score-configs/{configId}
export const GetScoreConfigQuery = z.object({
  configId: z.string(),
});

export const GetScoreConfigResponse = APIScoreConfig;

// POST /score-configs
const PostScoreConfigBase = z.object({
  name: z.string(),
  description: z.string().nullish(),
});

export const PostScoreConfigBody = z
  .discriminatedUnion("dataType", [
    PostScoreConfigBase.merge(NumericConfigFields),
    PostScoreConfigBase.merge(CategoricalConfigFields),
    // Boolean config API POST body will always infer the categories based on data type
    PostScoreConfigBase.merge(
      z.object({
        dataType: z.literal("BOOLEAN"),
        categories: z.undefined(),
      }),
    ),
  ])
  .superRefine((data, ctx) => {
    if (data.dataType === "NUMERIC") {
      if (
        isPresent(data.maxValue) &&
        isPresent(data.minValue) &&
        data.maxValue <= data.minValue
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum value must be greater than Minimum value",
        });
      }
    }
  });

export const PostScoreConfigResponse = APIScoreConfig;

// GET /score-configs
export const GetScoreConfigsQuery = z.object({
  ...publicApiPaginationZod,
});

export const GetScoreConfigsResponse = z.object({
  data: z.array(APIScoreConfig),
  meta: paginationMetaResponseZod,
});
