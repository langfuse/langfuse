import { z } from "zod/v4";
import { jsonSchema, publicApiPaginationZod } from "../../../../utils/zod";
import { stringDateTime } from "../../../../utils/typeChecks";
import { applyScoreValidation } from "../../../../utils/scores";
import { PostScoreBodyFoundationSchema } from "../shared";

const operators = ["<", ">", "<=", ">=", "!=", "="] as const;
const ScoreDataType = ["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const;
const ScoreSource = ["API", "EVAL", "ANNOTATION"] as const;

/**
 * Objects
 */
export const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: z.literal("NUMERIC"),
});

export const CategoricalData = z.object({
  value: z.number().nullish(),
  stringValue: z.string(),
  dataType: z.literal("CATEGORICAL"),
});

export const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: z.literal("BOOLEAN"),
});

/**
 * Foundation schema for all score types, needs to be extended with entity score may be associated with. Note there are two API versions, where v1 allows only trace and observation scores, while v2 additionally allows session and dataset run scores
 * @see {@link ScoreFoundationSchemaV1}, {@link ScoreFoundationSchemaV2}
 *
 * Must also be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
export const ScoreFoundationSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  projectId: z.string(),
  environment: z.string().default("default"),
  name: z.string(),
  source: z.enum(ScoreSource),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  configId: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  queueId: z.string().nullish(),
});

/**
 * Endpoints
 */

// GET /scores/{scoreId}
export const GetScoreQuery = z.object({
  scoreId: z.string(),
});

// GET /scores
export const GetScoresQuery = z.object({
  ...publicApiPaginationZod,
  userId: z.string().nullish(),
  dataType: z.enum(ScoreDataType).nullish(),
  configId: z.string().nullish(),
  queueId: z.string().nullish(),
  traceTags: z.union([z.array(z.string()), z.string()]).nullish(),
  environment: z.union([z.array(z.string()), z.string()]).nullish(),
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

// POST /scores
// Please note that the POST /scores endpoint supports all score types (trace, session, dataset run) across v1 and v2.
/**
 * PostScoresBody is copied for the ingestion API as `ScoreBody`. Please copy any changes here in `packages/shared/src/features/ingestion/types.ts`
 */
export const PostScoresBody = applyScoreValidation(
  z.discriminatedUnion("dataType", [
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.number(),
        dataType: z.literal("NUMERIC"),
        configId: z.string().nullish(),
      }),
    ),
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.string(),
        dataType: z.literal("CATEGORICAL"),
        configId: z.string().nullish(),
      }),
    ),
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.number().refine((value) => value === 0 || value === 1, {
          message:
            "Value must be a number equal to either 0 or 1 for data type BOOLEAN",
        }),
        dataType: z.literal("BOOLEAN"),
        configId: z.string().nullish(),
      }),
    ),
    PostScoreBodyFoundationSchema.merge(
      z.object({
        value: z.union([z.string(), z.number()]),
        dataType: z.undefined(),
        configId: z.string().nullish(),
      }),
    ),
  ]),
);

export const PostScoresResponse = z.object({ id: z.string() });

// DELETE /scores/{scoreId}
// Please note that the DELETE /scores/{scoreId} endpoint supports all score types (trace, session, dataset run) across v1 and v2.
export const DeleteScoreQuery = z.object({
  scoreId: z.string(),
});

export const DeleteScoreResponse = z.object({
  message: z.string(),
});
