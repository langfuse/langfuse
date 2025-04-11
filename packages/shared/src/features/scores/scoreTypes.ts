import { z } from "zod";
import { isPresent, stringDateTime } from "../../utils/typeChecks";
import {
  jsonSchema,
  NonEmptyString,
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "../../utils/zod";
import { Category as ConfigCategory } from "./scoreConfigTypes";
import { ScoreDomain } from "../../domain";
import { applyScoreValidation } from "../../utils/scores";

/**
 * Types to use across codebase
 */
export type APIScoreV2 = z.infer<typeof APIScoreSchemaV2>;
export type APIScoreV1 = z.infer<typeof APIScoreSchemaV1>;

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

const ScoreBaseProps = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  projectId: z.string(),
  environment: z.string().default("default"),
  name: z.string(),
  source: z.enum(ScoreSource),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  observationId: z.string().nullish(),
  configId: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  queueId: z.string().nullish(),
});

const ScoreBaseV2 = ScoreBaseProps.extend({
  traceId: z.string().nullish(),
  sessionId: z.string().nullish(),
});

const ScoreBaseV1 = ScoreBaseProps.extend({
  traceId: z.string(),
});

const BaseScoreBody = z.object({
  id: z.string().nullish(),
  name: NonEmptyString,
  traceId: z.string().nullish(),
  sessionId: z.string().nullish(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  environment: z.string().default("default"),
});

/**
 * Objects
 */

export const APIScoreSchemaV1 = z.discriminatedUnion("dataType", [
  ScoreBaseV1.merge(NumericData),
  ScoreBaseV1.merge(CategoricalData),
  ScoreBaseV1.merge(BooleanData),
]);

export const APIScoreSchemaV2 = z.discriminatedUnion("dataType", [
  ScoreBaseV2.merge(NumericData),
  ScoreBaseV2.merge(CategoricalData),
  ScoreBaseV2.merge(BooleanData),
]);

/**
 * Validation objects
 */
export const ScoreBodyWithoutConfig = applyScoreValidation(
  z.discriminatedUnion("dataType", [
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
  ]),
);

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

type LegacyValidatedAPIScore<IncludeHasMetadata extends boolean> =
  APIScoreV1 & {
    hasMetadata: IncludeHasMetadata extends true ? boolean : never;
  };

type ValidatedAPIScore<IncludeHasMetadata extends boolean> = APIScoreV2 & {
  hasMetadata: IncludeHasMetadata extends true ? boolean : never;
};

type InputScore = ScoreDomain & { hasMetadata?: boolean };

/**
 * @deprecated
 * Use `filterAndValidateDbScoreList` instead.
 * Use this function when pulling a list of scores from the database before using in the application to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scores
 * @returns list of validated scores
 */
export const legacyFilterAndValidateDbScoreList = <
  IncludeHasMetadata extends boolean,
>({
  scores,
  includeHasMetadata = false as IncludeHasMetadata,
  onParseError,
}: {
  scores: InputScore[];
  includeHasMetadata?: IncludeHasMetadata;
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void;
}): LegacyValidatedAPIScore<IncludeHasMetadata>[] => {
  return scores.reduce((acc, ts) => {
    const result = APIScoreSchemaV1.safeParse(ts);
    if (result.success) {
      const score = { ...result.data };
      if (includeHasMetadata) {
        Object.assign(score, { hasMetadata: ts.hasMetadata ?? false });
      }
      acc.push(score as LegacyValidatedAPIScore<IncludeHasMetadata>);
    } else {
      console.error("Score parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as LegacyValidatedAPIScore<IncludeHasMetadata>[]);
};

/**
 * Use this function when pulling a list of scores from the database before using in the application to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scores
 * @returns list of validated scores
 */
export const filterAndValidateDbScoreList = <
  IncludeHasMetadata extends boolean,
>({
  scores,
  includeHasMetadata = false as IncludeHasMetadata,
  onParseError,
}: {
  scores: InputScore[];
  includeHasMetadata?: IncludeHasMetadata;
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void;
}): ValidatedAPIScore<IncludeHasMetadata>[] => {
  return scores.reduce((acc, ts) => {
    const result = APIScoreSchemaV2.safeParse(ts);
    if (result.success) {
      const score = { ...result.data };
      if (includeHasMetadata) {
        Object.assign(score, { hasMetadata: ts.hasMetadata ?? false });
      }
      acc.push(score as ValidatedAPIScore<IncludeHasMetadata>);
    } else {
      console.error("Score parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as ValidatedAPIScore<IncludeHasMetadata>[]);
};

/**
 * Use this function when pulling a single score from the database before using in the application to ensure type safety.
 * The score is expected to pass the validation. If a score fails validation, an error will be thrown.
 * @param score
 * @returns validated score
 * @throws error if score fails validation
 */
export const validateDbScore = (score: ScoreDomain): APIScoreV2 =>
  APIScoreSchemaV2.parse(score);

/**
 * Endpoints
 */

// POST /scores
/**
 * PostScoresBody is copied for the ingestion API as `ScoreBody`. Please copy any changes here in `packages/shared/src/features/ingestion/types.ts`
 */
export const PostScoresBody = applyScoreValidation(
  z.discriminatedUnion("dataType", [
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
        value: z.number().refine((value) => value === 0 || value === 1, {
          message:
            "Value must be a number equal to either 0 or 1 for data type BOOLEAN",
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
  ]),
);

export const PostScoresResponse = z.object({ id: z.string() });

// GET /scores

export const GetScoresQueryV1 = z.object({
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

// GetScoreResponseDataV1 is only used for response of GET /scores list endpoint
const GetScoreResponseDataV1 = z.intersection(
  APIScoreSchemaV1,
  z.object({
    trace: z.object({
      userId: z.string().nullish(),
      tags: z.array(z.string()).nullish(),
      environment: z.string().nullish(),
    }),
  }),
);

export const GetScoresResponseV1 = z.object({
  data: z.array(GetScoreResponseDataV1),
  meta: paginationMetaResponseZod,
});

// GET /scores v2

export const GetScoresQueryV2 = GetScoresQueryV1;
const GetScoreResponseDataV2 = z.intersection(
  APIScoreSchemaV2,
  z.object({
    trace: z
      .object({
        userId: z.string().nullish(),
        tags: z.array(z.string()).nullish(),
        environment: z.string().nullish(),
      })
      .nullish(),
  }),
);

export const GetScoresResponseV2 = z.object({
  data: z.array(GetScoreResponseDataV2),
  meta: paginationMetaResponseZod,
});

export const legacyFilterAndValidateV1GetScoreList = (
  scores: unknown[],
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void,
): z.infer<typeof GetScoreResponseDataV1>[] =>
  scores.reduce(
    (acc: z.infer<typeof GetScoreResponseDataV1>[], ts) => {
      const result = GetScoreResponseDataV1.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        console.error("Score parsing error: ", result.error);
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof GetScoreResponseDataV1>[],
  );

export const legacyFilterAndValidateV2GetScoreList = (
  scores: unknown[],
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void,
): z.infer<typeof GetScoreResponseDataV2>[] =>
  scores.reduce(
    (acc: z.infer<typeof GetScoreResponseDataV2>[], ts) => {
      const result = GetScoreResponseDataV2.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        console.error("Score parsing error: ", result.error);
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof GetScoreResponseDataV2>[],
  );
// GET /scores/{scoreId}

export const GetScoreQueryV1 = z.object({
  scoreId: z.string(),
});
export const GetScoreResponseV1 = APIScoreSchemaV1;

// GET /scores/{scoreId} v2

export const GetScoreQueryV2 = GetScoreQueryV1;
export const GetScoreResponseV2 = APIScoreSchemaV2;

// DELETE /scores/{scoreId}
export const DeleteScoreQuery = z.object({
  scoreId: z.string(),
});

export const DeleteScoreResponse = z.object({
  message: z.string(),
});
