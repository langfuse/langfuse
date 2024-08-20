import { z } from "zod";

import { Score } from "@prisma/client";

import { isPresent, stringDateTime } from "../../utils/typeChecks";
import {
  NonEmptyString,
  paginationMetaResponseZod,
  paginationZod,
} from "../../utils/zod";
import { Category as ConfigCategory } from "./scoreConfigTypes";

/**
 * Types to use across codebase
 */
export type APIScore = z.infer<typeof APIScoreSchema>;

/**
 * Helpers
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
  value: z.number().nullish(),
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

/**
 * Objects
 */

export const APIScoreSchema = z.discriminatedUnion("dataType", [
  ScoreBase.merge(NumericData),
  ScoreBase.merge(CategoricalData),
  ScoreBase.merge(BooleanData),
]);

/**
 * Validation objects
 */
export const ScoreBodyWithoutConfig = z.discriminatedUnion("dataType", [
  BaseScoreBody.merge(
    z.object({
      value: z.number(),
      dataType: z.literal("NUMERIC"),
    })
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.string(),
      dataType: z.literal("CATEGORICAL"),
    })
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.number().refine((val) => val === 0 || val === 1, {
        message: "Value must be either 0 or 1",
      }),
      dataType: z.literal("BOOLEAN"),
    })
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

/**
 * Use this function when pulling a list of scores from the database before using in the application to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scores
 * @returns list of validated scores
 */
export const filterAndValidateDbScoreList = (
  scores: Score[],
  onParseError?: (error: z.ZodError) => void
): APIScore[] =>
  scores.reduce((acc, ts) => {
    const result = APIScoreSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      console.error("Score parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as APIScore[]);

/**
 * Use this function when pulling a single score from the database before using in the application to ensure type safety.
 * The score is expected to pass the validation. If a score fails validation, an error will be thrown.
 * @param score
 * @returns validated score
 * @throws error if score fails validation
 */
export const validateDbScore = (score: Score): APIScore =>
  APIScoreSchema.parse(score);

/**
 * Endpoints
 */

// POST /scores
/**
 * PostScoresBody is copied for the ingestion API as `ScoreBody`. Please copy any changes here in `packages/shared/src/features/ingestion/types.ts`
 */
export const PostScoresBody = z.discriminatedUnion("dataType", [
  BaseScoreBody.merge(
    z.object({
      value: z.number(),
      dataType: z.literal("NUMERIC"),
      configId: z.string().nullish(),
    })
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.string(),
      dataType: z.literal("CATEGORICAL"),
      configId: z.string().nullish(),
    })
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.number().refine((value) => value === 0 || value === 1, {
        message:
          "Value must be a number equal to either 0 or 1 for data type BOOLEAN",
      }),
      dataType: z.literal("BOOLEAN"),
      configId: z.string().nullish(),
    })
  ),
  BaseScoreBody.merge(
    z.object({
      value: z.union([z.string(), z.number()]),
      dataType: z.undefined(),
      configId: z.string().nullish(),
    })
  ),
]);

export const PostScoresResponse = z.object({ id: z.string() });

// GET /scores
export const GetScoresQuery = z.object({
  ...paginationZod,
  userId: z.string().nullish(),
  dataType: z.enum(ScoreDataType).nullish(),
  configId: z.string().nullish(),
  name: z.string().nullish(),
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
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

// LegacyGetScoreResponseDataV1 is only used for response of GET /scores list endpoint
const LegacyGetScoreResponseDataV1 = z.intersection(
  APIScoreSchema,
  z.object({
    trace: z.object({
      userId: z.string().nullish(),
    }),
  })
);
export const GetScoresResponse = z.object({
  data: z.array(LegacyGetScoreResponseDataV1),
  meta: paginationMetaResponseZod,
});

export const legacyFilterAndValidateV1GetScoreList = (
  scores: unknown[],
  onParseError?: (error: z.ZodError) => void
): z.infer<typeof LegacyGetScoreResponseDataV1>[] =>
  scores.reduce(
    (acc: z.infer<typeof LegacyGetScoreResponseDataV1>[], ts) => {
      const result = LegacyGetScoreResponseDataV1.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        console.error("Score parsing error: ", result.error);
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof LegacyGetScoreResponseDataV1>[]
  );

// GET /scores/{scoreId}
export const GetScoreQuery = z.object({
  scoreId: z.string(),
});

export const GetScoreResponse = APIScoreSchema;

// DELETE /scores/{scoreId}
export const DeleteScoreQuery = z.object({
  scoreId: z.string(),
});

export const DeleteScoreResponse = z.object({
  message: z.string(),
});
