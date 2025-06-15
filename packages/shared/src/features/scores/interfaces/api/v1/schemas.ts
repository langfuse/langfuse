import { z } from "zod/v4";
import {
  CategoricalData,
  NumericData,
  BooleanData,
  ScoreFoundationSchema,
} from "../shared";

/**
 * Foundation schema for scores API v1 i.e. trace and observation scores ONLY
 *
 * Must be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
const ScoreFoundationSchemaV1 = ScoreFoundationSchema.extend({
  traceId: z.string(),
  observationId: z.string().nullish(),
});

export const APIScoreSchemaV1 = z.discriminatedUnion("dataType", [
  ScoreFoundationSchemaV1.merge(NumericData),
  ScoreFoundationSchemaV1.merge(CategoricalData),
  ScoreFoundationSchemaV1.merge(BooleanData),
]);

export type APIScoreV1 = z.infer<typeof APIScoreSchemaV1>;
