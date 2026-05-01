import {
  BooleanData,
  CategoricalData,
  NumericData,
  ScoreSchemaExclReferencesAndDates,
} from "../../../../../domain";
import z from "zod";

// Response-only schemas without input validation constraints (e.g. length limits).
// Input constraints are enforced at write time; response schemas must accept any stored value.
const CorrectionData = z.object({
  stringValue: z.string(),
  dataType: z.literal("CORRECTION"),
});

const TextData = z.object({
  stringValue: z.string(),
  dataType: z.literal("TEXT"),
});

/**
 * Foundation schema for scores API v2 i.e. trace, observation AND session scores
 *
 * Must be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
const ScoreFoundationSchemaV2 = ScoreSchemaExclReferencesAndDates.extend({
  // Timestamps
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  timestamp: z.coerce.date(),
  // Score references; one of the following must be provided
  traceId: z.string().nullish(),
  observationId: z.string().nullish(),
  sessionId: z.string().nullish(),
  datasetRunId: z.string().nullish(),
});

export const APIScoreSchemaV2 = z.discriminatedUnion("dataType", [
  ScoreFoundationSchemaV2.extend(NumericData.shape),
  ScoreFoundationSchemaV2.extend(CategoricalData.shape),
  ScoreFoundationSchemaV2.extend(BooleanData.shape),
  ScoreFoundationSchemaV2.extend(CorrectionData.shape),
  // a numeric value does not make sense for TEXT scores, so we omit the property
  ScoreFoundationSchemaV2.omit({ value: true }).extend(TextData.shape),
]);

export type APIScoreV2 = z.infer<typeof APIScoreSchemaV2>;
