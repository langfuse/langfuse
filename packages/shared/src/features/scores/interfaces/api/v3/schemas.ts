import { z } from "zod";
import { ScoreSourceDomain } from "../../../../../domain/scores";

// Discriminated on `kind` so the type system enforces that `traceId` is
// only ever present on the observation arm — matches the Fern union and
// the deriveSubject runtime contract.
export const ScoreSubjectV3 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trace"),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("observation"),
    id: z.string(),
    traceId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("session"),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("experiment"),
    id: z.string(),
  }),
]);

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
  // optional groups
  comment: z.string().nullable().optional(),
  configId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  authorUserId: z.string().nullable().optional(),
  queueId: z.string().nullable().optional(),
  subject: ScoreSubjectV3.optional(),
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
