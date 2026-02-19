import {
  BooleanData,
  CategoricalData,
  NumericData,
  ScoreSchemaExclReferencesAndDates,
} from "../../../../../domain";
import z from "zod/v4";

const CorrectionData = z.object({
  stringValue: z.string(),
  dataType: z.literal("CORRECTION"),
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

export const APIScoreSchemaV2 = ScoreFoundationSchemaV2.and(
  z.discriminatedUnion("dataType", [
    NumericData,
    CategoricalData,
    BooleanData,
    CorrectionData,
  ]),
);

export type APIScoreV2 = z.infer<typeof APIScoreSchemaV2>;
