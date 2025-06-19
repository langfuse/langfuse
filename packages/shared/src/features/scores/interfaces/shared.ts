import { jsonSchema } from "../../../utils/zod";
import z from "zod/v4";
import { NonEmptyString } from "../../../utils/zod";

/**
 * Foundation schema for all score types. Used for ingestion and public API. Supports trace, observation and session scores.
 * Needs to be extended with with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
export const PostScoreBodyFoundationSchema = z.object({
  id: z.string().nullish(),
  name: NonEmptyString,
  traceId: z.string().nullish(),
  sessionId: z.string().nullish(),
  datasetRunId: z.string().nullish(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  environment: z.string().default("default"),
});
