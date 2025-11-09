import { z } from "zod/v4";
import { ScoreSchema } from "../../../../../domain";

/**
 * Foundation schema for scores API v2 i.e. trace, observation AND session scores
 *
 * Must be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */

export const APIScoreSchemaV2 = ScoreSchema;
export type APIScoreV2 = z.infer<typeof APIScoreSchemaV2>;
