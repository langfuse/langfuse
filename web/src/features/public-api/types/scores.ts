import * as Sentry from "@sentry/node";
import {
  paginationZod,
  paginationMetaResponseZod,
  NonEmptyString,
  type Score,
} from "@langfuse/shared";
import { z } from "zod";
import { isPresent } from "@/src/utils/typeChecks";
import { Category as ConfigCategory } from "./score-configs";

/**
 * Objects
 */

const ScoreSource = ["API", "EVAL", "ANNOTATION"] as const;
const ScoreDataType = ["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const;

const operators = ["<", ">", "<=", ">=", "!=", "="] as const;

const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: z.literal("NUMERIC"),
});

const CategoricalData = z.object({
  value: z.number().optional().nullish(),
  stringValue: z.string(),
  dataType: z.literal("CATEGORICAL"),
});

const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: z.literal("BOOLEAN"),
});

const ScoreBase = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  projectId: z.string(),
  name: z.string(),
  source: z.enum(ScoreSource),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  configId: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const BaseScoreBody = z.object({
  id: z.string().nullish(),
  name: NonEmptyString,
  traceId: z.string(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
});

const GetScoresDataBase = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  name: z.string(),
  source: z.enum(ScoreSource),
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  trace: z.object({
    userId: z.string(),
  }),
  configId: z.string().nullish(),
});

export const GetScoresData = z.discriminatedUnion("dataType", [
  GetScoresDataBase.merge(NumericData),
  GetScoresDataBase.merge(CategoricalData),
  GetScoresDataBase.merge(BooleanData),
]);

const ValidatedScoreSchema = z.discriminatedUnion("dataType", [
  ScoreBase.merge(NumericData),
  ScoreBase.merge(CategoricalData),
  ScoreBase.merge(BooleanData),
]);

export type ValidatedGetScoresData = z.infer<typeof GetScoresData>;

export type ValidatedScore = z.infer<typeof ValidatedScoreSchema>;

/**
 * Validation objects
 */
export const ScoreBodyWithoutConfig = z.discriminatedUnion("dataType", [
  BaseScoreBody.merge(
    z.object({
      value: z.number(),
      dataType: z.literal("NUMERIC"),
    }),
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.string(),
      dataType: z.literal("CATEGORICAL"),
    }),
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.number().refine((val) => val === 0 || val === 1, {
        message: "Value must be either 0 or 1",
      }),
      dataType: z.literal("BOOLEAN"),
    }),
  ),
]);

const ScorePropsAgainstConfigNumeric = z
  .object({
    value: z.number(),
    maxValue: z.number().optional(),
    minValue: z.number().optional(),
    dataType: z.literal("NUMERIC"),
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
    dataType: z.literal("CATEGORICAL"),
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
    dataType: z.literal("BOOLEAN"),
  }),
]);

/**
 * Transformations
 */

export const filterAndValidateDbScoreList = (
  scores: Score[],
): ValidatedScore[] =>
  scores.reduce((acc, ts) => {
    const result = ValidatedScoreSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      Sentry.captureException(result.error);
    }
    return acc;
  }, [] as ValidatedScore[]);

export const validateDbScore = (score: Score): ValidatedScore =>
  ValidatedScoreSchema.parse(score);

/**
 * Endpoints
 */

// POST /scores
/**
 * PostScoresBody is copied for the ingestion API as `ScoreBody`. Please copy any changes here in `packages/shared/src/features/ingestion/types.ts`
 */
export const PostScoresBody = z
  .discriminatedUnion("dataType", [
    BaseScoreBody.merge(
      z.object({
        value: z.number(),
        dataType: z.literal("NUMERIC"),
        configId: z.string().nullish(),
      }),
    ),
    BaseScoreBody.merge(
      z.object({
        value: z.string(),
        dataType: z.literal("CATEGORICAL"),
        configId: z.string().nullish(),
      }),
    ),
    BaseScoreBody.merge(
      z.object({
        value: z.number().refine((val) => val === 0 || val === 1, {
          message: "Value must be either 0 or 1",
        }),
        dataType: z.literal("BOOLEAN"),
        configId: z.string().nullish(),
      }),
    ),
    BaseScoreBody.merge(
      z.object({
        value: z.union([z.string(), z.number()]),
        dataType: z.undefined(),
        configId: z.string().nullish(),
      }),
    ),
  ])
  .superRefine((data, ctx) => {
    if (data.dataType) {
      if (typeof data.value === "number") {
        if (data.dataType === "CATEGORICAL") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Value must be a string for data type ${data.dataType}`,
          });
        }
      } else if (typeof data.value === "string") {
        if (data.dataType === "NUMERIC") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Value must be a number for data type ${data.dataType}`,
          });
        } else if (data.dataType === "BOOLEAN") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Value must number equal to either 0 or 1 for data type ${data.dataType}`,
          });
        }
      }
    }
  });

export const PostScoresResponse = z.void();

// GET /scores
export const GetScoresQuery = z.object({
  ...paginationZod,
  userId: z.string().nullish(),
  dataType: z.enum(ScoreDataType).nullish(),
  configId: z.string().nullish(),
  name: z.string().nullish(),
  fromTimestamp: z.coerce.date().nullish(),
  source: z.enum(ScoreSource).nullish(),
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
  data: z.array(GetScoresData),
  meta: paginationMetaResponseZod,
});

// GET /scores/{scoreId}
export const GetScoreQuery = z.object({
  scoreId: z.string(),
});

export const GetScoreResponse = ValidatedScoreSchema;

// DELETE /scores/{scoreId}
export const DeleteScoreQuery = z.object({
  scoreId: z.string(),
});

export const DeleteScoreResponse = z.object({
  message: z.string(),
});
