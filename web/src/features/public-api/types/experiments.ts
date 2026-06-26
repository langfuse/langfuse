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

const EXPERIMENT_FILTER_COLUMNS = ["id", "name", "datasetId"] as const;
const ExperimentFilterColumn = z.enum(EXPERIMENT_FILTER_COLUMNS);

const experimentFilterState = z
  .array(
    z.intersection(
      eventsTableSingleFilter,
      z.object({ column: ExperimentFilterColumn }).loose(),
    ),
  )
  .transform((filters) => filters as EventsTableFilterState);

export const ExperimentsCursorV1 = z.discriminatedUnion("v", [
  z.object({
    v: z.literal(1),
    lastStartTimeTo: z.coerce.date(),
    lastTraceId: z.string(),
    lastId: z.string(),
    lastExperimentId: z.string(),
  }),
]);

export type ExperimentsCursorV1Type = z.infer<typeof ExperimentsCursorV1>;

export const EncodedExperimentsCursorV1String = z
  .string()
  .describe("Base64url-encoded cursor for pagination");

export const EncodedExperimentsCursorV1 = z
  .string()
  .transform((value) => {
    try {
      const decoded = Buffer.from(value, "base64url").toString("utf-8");
      return JSON.parse(decoded);
    } catch (_error) {
      throw new InvalidRequestError("Invalid cursor format");
    }
  })
  .pipe(ExperimentsCursorV1);

const experimentScoreLimitZod = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().gte(1).lte(50).default(50),
);

export const encodeExperimentsCursor = (
  cursor: ExperimentsCursorV1Type,
): z.infer<typeof EncodedExperimentsCursorV1String> =>
  Buffer.from(
    JSON.stringify({
      v: cursor.v,
      lastStartTimeTo:
        cursor.lastStartTimeTo instanceof Date
          ? cursor.lastStartTimeTo.toISOString()
          : cursor.lastStartTimeTo,
      lastTraceId: cursor.lastTraceId,
      lastId: cursor.lastId,
      lastExperimentId: cursor.lastExperimentId,
    }),
  ).toString("base64url");

export const GetExperimentsV1Query = z.object({
  fields: commaSeparatedEnumArray(EXPERIMENT_FIELD_GROUPS, ["core"]),
  limit: publicApiPaginationLimitZod,
  scoreLimit: experimentScoreLimitZod,
  cursor: EncodedExperimentsCursorV1.optional(),
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

export const ExperimentV1 = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    startTime: z.coerce.date(),
    itemCount: z.number(),
    datasetId: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    scores: z.array(APIScoreSchemaV3).optional(),
  })
  .strict();

export const GetExperimentsV1Response = z
  .object({
    data: z.array(ExperimentV1),
    meta: z.object({
      cursor: EncodedExperimentsCursorV1String.optional(),
    }),
  })
  .strict();

export type GetExperimentsV1ResponseType = z.infer<
  typeof GetExperimentsV1Response
>;
