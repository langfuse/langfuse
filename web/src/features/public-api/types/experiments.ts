import {
  APIScoreSchemaV3,
  commaSeparatedEnumArray,
  eventsTableSingleFilter,
  InvalidRequestError,
  optionalJsonParam,
  optionalCommaSeparatedStringArray,
  publicApiPaginationLimitZod,
  type EventsTableFilterState,
} from "@langfuse/shared";
import { z } from "zod";

const EXPERIMENT_FIELD_GROUPS = ["core", "metadata", "scores"] as const;

const EXPERIMENT_ITEM_FIELD_GROUPS = [
  "core",
  "dataset",
  "io",
  "metadata",
  "itemMetadata",
  "experimentMetadata",
  "scores",
] as const;

export const EXPERIMENT_FILTER_COLUMNS = ["id", "name", "datasetId"] as const;
const ExperimentFilterColumn = z.enum(EXPERIMENT_FILTER_COLUMNS);
export const EXPERIMENT_ITEM_FILTER_COLUMNS = [
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

export const EncodedExperimentsCursorString = z
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
const ExperimentCursorV1 = z.discriminatedUnion("v", [
  z.object({
    v: z.literal(1),
    lastTime: z.string(),
    lastTraceId: z.string(),
    lastId: z.string(),
    lastExperimentId: z.string(),
  }),
]);

type ExperimentCursorV1Type = z.infer<typeof ExperimentCursorV1>;

const EncodedExperimentCursorV1 = z
  .string()
  .transform(decodeCursor)
  .pipe(ExperimentCursorV1);

const experimentScoreLimitZod = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().gte(1).lte(50).default(50),
);

const experimentFieldsZod = commaSeparatedEnumArray(EXPERIMENT_FIELD_GROUPS, [
  "core",
]).describe(
  `Response field groups to include. Available groups: ${EXPERIMENT_FIELD_GROUPS.join(", ")}.`,
);

const experimentItemFieldsZod = commaSeparatedEnumArray(
  EXPERIMENT_ITEM_FIELD_GROUPS,
  ["core", "dataset"],
).describe(
  `Response field groups to include. Available groups: ${EXPERIMENT_ITEM_FIELD_GROUPS.join(", ")}.`,
);

const optionalStringArrayZod = z.array(z.string()).optional();

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

export const GetExperimentsV1ParsedQuery = z.object({
  fields: experimentFieldsZod,
  limit: publicApiPaginationLimitZod,
  scoreLimit: experimentScoreLimitZod,
  cursor: EncodedExperimentCursorV1.optional(),
  fromStartTime: z.iso.datetime({ offset: true }),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  id: optionalStringArrayZod,
  name: optionalStringArrayZod,
  datasetId: optionalStringArrayZod,
  filter: experimentFilterState.optional(),
});

export const GetExperimentsV1Query = z
  .object({
    fields: experimentFieldsZod,
    limit: publicApiPaginationLimitZod,
    scoreLimit: experimentScoreLimitZod,
    cursor: EncodedExperimentsCursorString.optional(),
    fromStartTime: z.iso.datetime({ offset: true }),
    toStartTime: z.iso.datetime({ offset: true }).optional(),
    id: optionalCommaSeparatedStringArray,
    name: optionalCommaSeparatedStringArray,
    datasetId: optionalCommaSeparatedStringArray,
    filter: optionalJsonParam(experimentFilterState, "filter"),
  })
  .transform((query) => GetExperimentsV1ParsedQuery.parse(query));

export type GetExperimentsV1QueryType = z.infer<
  typeof GetExperimentsV1ParsedQuery
>;

export const GetExperimentItemsV1ParsedQueryBase = z.object({
  fields: experimentItemFieldsZod,
  limit: publicApiPaginationLimitZod,
  scoreLimit: experimentScoreLimitZod,
  cursor: EncodedExperimentCursorV1.optional(),
  fromStartTime: z.iso.datetime({ offset: true }),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  experimentId: optionalStringArrayZod,
  experimentName: optionalStringArrayZod,
  experimentItemId: optionalStringArrayZod,
  datasetId: optionalStringArrayZod,
  filter: experimentItemFilterState.optional(),
});

export const GetExperimentItemsV1ParsedQuery =
  GetExperimentItemsV1ParsedQueryBase;

export const GetExperimentItemsV1Query = z
  .object({
    fields: experimentItemFieldsZod,
    limit: publicApiPaginationLimitZod,
    scoreLimit: experimentScoreLimitZod,
    cursor: EncodedExperimentsCursorString.optional(),
    fromStartTime: z.iso.datetime({ offset: true }),
    toStartTime: z.iso.datetime({ offset: true }).optional(),
    experimentId: optionalCommaSeparatedStringArray,
    experimentName: optionalCommaSeparatedStringArray,
    experimentItemId: optionalCommaSeparatedStringArray,
    datasetId: optionalCommaSeparatedStringArray,
    filter: optionalJsonParam(experimentItemFilterState, "filter"),
  })
  .transform((query) => GetExperimentItemsV1ParsedQuery.parse(query));

export type GetExperimentItemsV1QueryType = z.infer<
  typeof GetExperimentItemsV1ParsedQuery
>;

const ExperimentV1 = z
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

const ExperimentItemV1 = z
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
