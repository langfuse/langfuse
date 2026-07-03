import {
  APIScoreSchemaV3,
  commaSeparatedEnumArray,
  eventsTableSingleFilter,
  InvalidRequestError,
  optionalCommaSeparatedStringArray,
  publicApiPaginationLimitZod,
  type EventsTableFilterState,
} from "@langfuse/shared";
import { z } from "zod";

export const EXPERIMENT_FIELD_GROUPS = ["core", "metadata", "scores"] as const;
export const ExperimentFieldGroup = z.enum(EXPERIMENT_FIELD_GROUPS);
export type ExperimentFieldGroup = z.infer<typeof ExperimentFieldGroup>;

export const EXPERIMENT_ITEM_FIELD_GROUPS = [
  "core",
  "dataset",
  "io",
  "metadata",
  "itemMetadata",
  "experimentMetadata",
  "scores",
] as const;
export const ExperimentItemFieldGroup = z.enum(EXPERIMENT_ITEM_FIELD_GROUPS);
export type ExperimentItemFieldGroup = z.infer<typeof ExperimentItemFieldGroup>;

const EXPERIMENT_FILTER_COLUMNS = ["id", "name", "datasetId"] as const;
const ExperimentFilterColumn = z.enum(EXPERIMENT_FILTER_COLUMNS);
const EXPERIMENT_ITEM_FILTER_COLUMNS = [
  "experimentId",
  "experimentName",
  "experimentItemId",
  "datasetId",
] as const;
const ExperimentItemFilterColumn = z.enum(EXPERIMENT_ITEM_FILTER_COLUMNS);

const experimentFilterState = z
  .array(
    z.intersection(
      eventsTableSingleFilter,
      z.object({ column: ExperimentFilterColumn }).loose(),
    ),
  )
  .transform((filters) => filters as EventsTableFilterState);

const experimentItemFilterState = z
  .array(
    z.intersection(
      eventsTableSingleFilter,
      z.object({ column: ExperimentItemFilterColumn }).loose(),
    ),
  )
  .transform((filters) => filters as EventsTableFilterState);

const encodedCursorString = z
  .string()
  .describe("Base64url-encoded cursor for pagination");

const decodeCursor = (value: string) => {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch (_error) {
    throw new InvalidRequestError("Invalid cursor format");
  }
};

// Shared by /experiments and /experiment-items; summaries pagination does not
// use lastTraceId today but carries it so both endpoints share one cursor.
export const ExperimentCursorV1 = z.discriminatedUnion("v", [
  z.object({
    v: z.literal(1),
    lastTime: z.string(),
    lastTraceId: z.string(),
    lastId: z.string(),
    lastExperimentId: z.string(),
  }),
]);

export type ExperimentCursorV1Type = z.infer<typeof ExperimentCursorV1>;

export const EncodedExperimentsCursorString = encodedCursorString;

export const EncodedExperimentCursorV1 = z
  .string()
  .transform(decodeCursor)
  .pipe(ExperimentCursorV1);

const experimentScoreLimitZod = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().gte(1).lte(50).default(50),
);

export const encodeExperimentCursor = (
  cursor: ExperimentCursorV1Type,
): z.infer<typeof EncodedExperimentsCursorString> =>
  Buffer.from(
    JSON.stringify({
      v: cursor.v,
      lastTime: cursor.lastTime,
      lastTraceId: cursor.lastTraceId,
      lastId: cursor.lastId,
      lastExperimentId: cursor.lastExperimentId,
    }),
  ).toString("base64url");

export const GetExperimentsV1Query = z.object({
  fields: commaSeparatedEnumArray(EXPERIMENT_FIELD_GROUPS, ["core"]),
  limit: publicApiPaginationLimitZod,
  scoreLimit: experimentScoreLimitZod,
  cursor: EncodedExperimentCursorV1.optional(),
  fromStartTime: z.iso.datetime({ offset: true }),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  id: optionalCommaSeparatedStringArray,
  name: optionalCommaSeparatedStringArray,
  datasetId: optionalCommaSeparatedStringArray,
  filter: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return undefined;
      try {
        return JSON.parse(str);
      } catch (error) {
        if (error instanceof InvalidRequestError) throw error;
        throw new InvalidRequestError("Invalid JSON in filter parameter");
      }
    })
    .pipe(experimentFilterState.optional()),
});

export type GetExperimentsV1QueryType = z.infer<typeof GetExperimentsV1Query>;

export const GetExperimentItemsV1Query = z.object({
  fields: commaSeparatedEnumArray(EXPERIMENT_ITEM_FIELD_GROUPS, [
    "core",
    "dataset",
  ]),
  limit: publicApiPaginationLimitZod,
  scoreLimit: experimentScoreLimitZod,
  cursor: EncodedExperimentCursorV1.optional(),
  fromStartTime: z.iso.datetime({ offset: true }),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  experimentId: optionalCommaSeparatedStringArray,
  experimentName: optionalCommaSeparatedStringArray,
  experimentItemId: optionalCommaSeparatedStringArray,
  datasetId: optionalCommaSeparatedStringArray,
  filter: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return undefined;
      try {
        return JSON.parse(str);
      } catch (error) {
        if (error instanceof InvalidRequestError) throw error;
        throw new InvalidRequestError("Invalid JSON in filter parameter");
      }
    })
    .pipe(experimentItemFilterState.optional()),
});

export type GetExperimentItemsV1QueryType = z.infer<
  typeof GetExperimentItemsV1Query
>;

export const ExperimentV1 = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    itemCount: z.number().int(),
    datasetId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    scores: z.array(APIScoreSchemaV3).optional(),
  })
  .strict();

export const GetExperimentsV1Response = z
  .object({
    data: z.array(ExperimentV1),
    meta: z.object({
      cursor: EncodedExperimentsCursorString.optional(),
    }),
  })
  .strict();

export type GetExperimentsV1ResponseType = z.infer<
  typeof GetExperimentsV1Response
>;

export const ExperimentItemV1 = z
  .object({
    id: z.string(),
    traceId: z.string(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().nullable(),
    level: z.enum(["DEBUG", "DEFAULT", "WARNING", "ERROR"]),
    environment: z.string(),
    experimentId: z.string(),
    experimentName: z.string(),
    experimentItemId: z.string(),
    experimentDatasetId: z.string().nullable().optional(),
    experimentItemVersion: z.coerce.date().nullable().optional(),
    input: z.any().optional(),
    output: z.any().optional(),
    expectedOutput: z.any().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    experimentItemMetadata: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional(),
    experimentMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
    experimentDescription: z.string().nullable().optional(),
    scores: z.array(APIScoreSchemaV3).optional(),
  })
  .strict();

export const GetExperimentItemsV1Response = z
  .object({
    data: z.array(ExperimentItemV1),
    meta: z.object({
      cursor: EncodedExperimentsCursorString.optional(),
    }),
  })
  .strict();

export type GetExperimentItemsV1ResponseType = z.infer<
  typeof GetExperimentItemsV1Response
>;
