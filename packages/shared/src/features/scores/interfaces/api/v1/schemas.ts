import { z } from "zod/v4";
import {
  ScoreSchemaExclReferencesAndDates,
  CategoricalData,
  NumericData,
  BooleanData,
} from "../../../../../domain/scores";

/**
 * Foundation schema for scores API v1 i.e. trace and observation scores ONLY
 *
 * Must be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
const ScoreFoundationSchemaV1 = ScoreSchemaExclReferencesAndDates.extend({
  // Timestamps
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  timestamp: z.coerce.date(),
  // Score references
  traceId: z.string(),
  observationId: z.string().nullish(),
});

export const APIScoreSchemaV1 = ScoreFoundationSchemaV1.and(
  z.discriminatedUnion("dataType", [NumericData, CategoricalData, BooleanData]),
);

export type APIScoreV1 = z.infer<typeof APIScoreSchemaV1>;
