import { z } from "zod";
import { ScoreSourceDomain } from "../../../../../domain/scores";

/**
 * Foundation schema for scores API v3.
 *
 * Must be extended with a dataType-specific value shape.
 *
 * Unlike v1/v2, v3 returns the score's value as a single polymorphic field
 * (number | boolean | string) rather than the dataType-split
 * `value` / `stringValue` / `longStringValue` triple.
 */
const ScoreFoundationSchemaV3 = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  source: ScoreSourceDomain,
  timestamp: z.coerce.date(),
  environment: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const APIScoreSchemaV3 = z.discriminatedUnion("dataType", [
  ScoreFoundationSchemaV3.extend({
    dataType: z.literal("NUMERIC"),
    value: z.number(),
  }),
  ScoreFoundationSchemaV3.extend({
    dataType: z.literal("BOOLEAN"),
    value: z.boolean(),
  }),
  ScoreFoundationSchemaV3.extend({
    dataType: z.literal("CATEGORICAL"),
    value: z.string(),
  }),
  ScoreFoundationSchemaV3.extend({
    dataType: z.literal("TEXT"),
    value: z.string(),
  }),
  ScoreFoundationSchemaV3.extend({
    dataType: z.literal("CORRECTION"),
    value: z.string(),
  }),
]);

export type APIScoreV3 = z.infer<typeof APIScoreSchemaV3>;
