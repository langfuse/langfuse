import { z } from "zod/v4";
import { ScoreSchema } from "../../../../../domain/scores";

/**
 * API v2 score schema
 * Directly uses the domain score schema as V2 supports all score types
 * (trace, observation, session, and dataset run scores)
 */
export const APIScoreSchemaV2 = ScoreSchema;

export type APIScoreV2 = z.infer<typeof APIScoreSchemaV2>;
