import { z } from "zod";
import {
  ScoreSchemaExclReferencesAndDates,
  CategoricalData,
  NumericData,
  BooleanData,
} from "../../../../../domain/scores";

/**
 * Foundation schema for scores API v1 i.e. trace and observation scores ONLY
 *
 * Must be extended with score data specific schema (numeric, categorical, boolean, text)
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

// Response-only schema without input validation constraints (e.g. length limits)
const TextData = z.object({
  stringValue: z.string(),
  dataType: z.literal("TEXT"),
});

export const APIScoreSchemaV1 = z.discriminatedUnion("dataType", [
  ScoreFoundationSchemaV1.extend(NumericData.shape),
  ScoreFoundationSchemaV1.extend(CategoricalData.shape),
  ScoreFoundationSchemaV1.extend(BooleanData.shape),
  ScoreFoundationSchemaV1.omit({ value: true }).extend(TextData.shape),
]);

export type APIScoreV1 = z.infer<typeof APIScoreSchemaV1>;
