import { z } from "zod/v4";
import {
  CategoricalData,
  NumericData,
  BooleanData,
  ScoreFoundationSchema,
} from "../shared";

/**
 * Foundation schema for scores API v2 i.e. trace, observation AND session scores
 *
 * Must be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
const ScoreFoundationSchemaV2 = ScoreFoundationSchema.extend({
  traceId: z.string().nullish(),
  observationId: z.string().nullish(),
  sessionId: z.string().nullish(),
  datasetRunId: z.string().nullish(),
});

export const APIScoreSchemaV2 = z.discriminatedUnion("dataType", [
  ScoreFoundationSchemaV2.merge(NumericData),
  ScoreFoundationSchemaV2.merge(CategoricalData),
  ScoreFoundationSchemaV2.merge(BooleanData),
]);

export type APIScoreV2 = z.infer<typeof APIScoreSchemaV2>;
