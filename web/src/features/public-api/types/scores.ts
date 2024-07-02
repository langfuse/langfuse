import { isPresent } from "@/src/features/manual-scoring/lib/helpers";
import {
  paginationZod,
  paginationMetaResponseZod,
  NonEmptyString,
  ScoreDataType,
  stringDate,
  ScoreSource,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */

const ConfigCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

const operators = ["<", ">", "<=", ">=", "!=", "="] as const;

const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: z.literal(ScoreDataType.NUMERIC),
});

const CategoricalData = z.object({
  value: z.number().optional().nullish(),
  stringValue: z.string(),
  dataType: z.literal(ScoreDataType.CATEGORICAL),
});

const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: z.literal(ScoreDataType.BOOLEAN),
});

const ScoreBase = z.object({
  id: z.string(),
  timestamp: z.union([stringDate, z.date()]),
  projectId: z.string(),
  name: z.string(),
  source: z.nativeEnum(ScoreSource),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  configId: z.string().nullish(),
  createdAt: z.union([stringDate, z.date()]),
  updatedAt: z.union([stringDate, z.date()]),
});

const Score = z.discriminatedUnion("dataType", [
  ScoreBase.merge(NumericData),
  ScoreBase.merge(CategoricalData),
  ScoreBase.merge(BooleanData),
]);

const BaseScoreBody = z.object({
  id: z.string().nullish(),
  name: NonEmptyString,
  traceId: z.string(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
});

const GetAllScoresBase = z.object({
  id: z.string(),
  timestamp: z.union([stringDate, z.date()]),
  name: z.string(),
  source: z.nativeEnum(ScoreSource),
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  trace: z.object({
    userId: z.string(),
  }),
  configId: z.string().nullish(),
});

export const GetAllScores = z.discriminatedUnion("dataType", [
  GetAllScoresBase.merge(NumericData),
  GetAllScoresBase.merge(CategoricalData),
  GetAllScoresBase.merge(BooleanData),
]);

export type GetScores = z.infer<typeof GetAllScores>;

/**
 * Validation objects
 */
export const ScoreBodyWithoutConfig = z.discriminatedUnion("dataType", [
  BaseScoreBody.merge(
    z.object({
      value: z.number(),
      dataType: z.literal(ScoreDataType.NUMERIC),
    }),
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.string(),
      dataType: z.literal(ScoreDataType.CATEGORICAL),
    }),
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.number().refine((val) => val === 0 || val === 1, {
        message: "Value must be either 0 or 1",
      }),
      dataType: z.literal(ScoreDataType.BOOLEAN),
    }),
  ),
]);

const ScorePropsAgainstConfigNumeric = z
  .object({
    value: z.number(),
    maxValue: z.number().optional(),
    minValue: z.number().optional(),
    dataType: z.literal(ScoreDataType.NUMERIC),
  })
  .superRefine((data, ctx) => {
    if (isPresent(data.maxValue) && data.value >= data.maxValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value exceeds maximum value of ${data.maxValue} defined in config`,
      });
    }
    if (isPresent(data.minValue) && data.value <= data.minValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value is below minimum value of ${data.minValue} defined in config`,
      });
    }
  });

const ScorePropsAgainstConfigCategorical = z
  .object({
    value: z.string(),
    categories: z.array(ConfigCategory),
    dataType: z.literal(ScoreDataType.CATEGORICAL),
  })
  .superRefine((data, ctx) => {
    if (!data.categories.some(({ label }) => label === data.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value ${data.value} does not map to a valid category. Pass a valid category value.`,
      });
    }
  });

export const ScorePropsAgainstConfig = z.union([
  ScorePropsAgainstConfigNumeric,
  ScorePropsAgainstConfigCategorical,
  z.object({
    value: z.number().refine((val) => val === 0 || val === 1, {
      message: "Value must be either 0 or 1",
    }),
    dataType: z.literal(ScoreDataType.BOOLEAN),
  }),
]);

/**
 * Endpoints
 */

// POST /scores
export const PostScoresBody = BaseScoreBody.extend({
  value: z.union([z.string(), z.number()]),
  dataType: z.nativeEnum(ScoreDataType).nullish(),
  configId: z.string().nullish(),
});

export const PostScoresResponse = z.void();

// GET /scores
export const GetScoresQuery = z.object({
  ...paginationZod,
  userId: z.string().nullish(),
  configId: z.string().nullish(),
  name: z.string().nullish(),
  fromTimestamp: stringDate,
  source: z.nativeEnum(ScoreSource).nullish(),
  value: z.coerce.number().nullish(),
  operator: z.enum(operators).nullish(),
  scoreIds: z
    .string()
    .transform((str) => str.split(",").map((id) => id.trim())) // Split the comma-separated string
    .refine((arr) => arr.every((id) => typeof id === "string"), {
      message: "Each score ID must be a string",
    })
    .nullish(),
});

export const GetScoresResponse = z.object({
  data: z.array(GetAllScores),
  meta: paginationMetaResponseZod,
});

// GET /scores/{scoreId}
export const GetScoreQuery = z.object({
  scoreId: z.string(),
});

export const GetScoreResponse = Score;
export const GetScoresError = z.object({
  message: z.string(),
  error: z.array(z.object({})),
});

// DELETE /scores/{scoreId}
export const DeleteScoreQuery = z.object({
  scoreId: z.string(),
});

export const DeleteScoreResponse = z.object({
  message: z.string(),
});
