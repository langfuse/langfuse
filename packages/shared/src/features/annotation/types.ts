import z from "zod";
import { StringNoHTML, StringNoHTMLNonEmpty } from "../../utils/zod";
import { CategoricalData, TextData, NumericData } from "../../domain";

const ScoreTargetTrace = z.object({
  type: z.literal("trace"),
  traceId: z.string(),
  observationId: z.string().optional(),
});

const ScoreTargetSession = z.object({
  type: z.literal("session"),
  sessionId: z.string(),
});

// Your existing ScoreTarget remains the same, but can now use these components
const ScoreTarget = z.discriminatedUnion("type", [
  ScoreTargetTrace,
  ScoreTargetSession,
]);

export type ScoreTargetTrace = z.infer<typeof ScoreTargetTrace>;
export type ScoreTargetSession = z.infer<typeof ScoreTargetSession>;
export type ScoreTarget = z.infer<typeof ScoreTarget>;

const CreateAnnotationScoreBase = z.object({
  id: z.string().optional(),
  name: StringNoHTMLNonEmpty,
  value: z.number(),
  projectId: z.string(),
  environment: z.string().default("default"),
  scoreTarget: ScoreTarget,
  configId: z.string(),
  comment: StringNoHTML.nullish(),
  queueId: z.string().nullish(),
  timestamp: z.coerce.date().optional(), // Required for ClickHouse deduplication - coerce handles string/number inputs
});

const UpdateAnnotationScoreBase = CreateAnnotationScoreBase.extend({
  id: z.string(),
});

const AnnotationBooleanData = z.object({
  stringValue: z.enum(["True", "False"]),
  dataType: z.literal("BOOLEAN"),
});

// The router persists `value` and `stringValue` verbatim, and the two feed
// different filter paths (scores_avg vs score_booleans) — derive `value` from
// the label so a crafted request cannot store an inconsistent pair like
// { stringValue: "True", value: 0 }.
const deriveBooleanValue = <
  T extends { dataType: string; stringValue?: string | null; value: number },
>(
  data: T,
): T =>
  data.dataType === "BOOLEAN"
    ? { ...data, value: data.stringValue === "True" ? 1 : 0 }
    : data;

/**
 * CreateAnnotationScoreData is only used for annotation scores created via the UI.
 * For langfuse score types please refer to `web/src/features/public-api/types/scores.ts`
 */
export const CreateAnnotationScoreData = CreateAnnotationScoreBase.and(
  z.discriminatedUnion("dataType", [
    NumericData,
    CategoricalData,
    AnnotationBooleanData,
    TextData,
  ]),
).transform(deriveBooleanValue);

export type CreateAnnotationScoreData = z.infer<
  typeof CreateAnnotationScoreData
>;

/**
 * UpdateAnnotationScoreData is only used for annotation scores updated via the UI
 * For langfuse score types please refer to `web/src/features/public-api/types/scores.ts`
 */
export const UpdateAnnotationScoreData = UpdateAnnotationScoreBase.and(
  z.discriminatedUnion("dataType", [
    NumericData,
    CategoricalData,
    AnnotationBooleanData,
    TextData,
  ]),
).transform(deriveBooleanValue);

export type UpdateAnnotationScoreData = z.infer<
  typeof UpdateAnnotationScoreData
>;

// annotation queues

/** Trace fields an annotation queue column can show. */
export const ANNOTATION_QUEUE_TRACE_FIELDS = [
  "userId",
  "sessionId",
  "name",
  "environment",
  "release",
  "version",
] as const;

/**
 * How a queue column shows its value:
 * - `text`: as stored
 * - `phone`: a phone number in its country's format (national format for +1,
 *   international otherwise); unparsable values are shown as stored
 * - `link`: a clickable http(s) URL
 * - `datetime`: an ISO date or Unix timestamp in the viewer's local time
 * - `number`: a number with digit grouping
 * - `duration`: a number of seconds as e.g. `2m 05s`
 * - `badge`: a coloured badge; a value keeps its colour across items
 */
export const ANNOTATION_QUEUE_COLUMN_FORMATS = [
  "text",
  "phone",
  "link",
  "datetime",
  "number",
  "duration",
  "badge",
] as const;

/**
 * An extra column of a queue's items table, read from the item's trace:
 * - `trace`: a trace field, `key` is one of ANNOTATION_QUEUE_TRACE_FIELDS
 * - `metadata`: a metadata key; a dotted path such as `customer.name` reads
 *   into a metadata value that holds JSON
 * - `tag`: the part after `key` of the trace's tags that start with it, e.g.
 *   key `region:` shows `eu-west` for the tag `region:eu-west`
 * Each column is also offered as a text filter.
 */
export const AnnotationQueueDisplayColumn = z
  .object({
    source: z.enum(["trace", "metadata", "tag"]),
    key: z.string().trim().min(1).max(200),
    label: StringNoHTMLNonEmpty.max(50),
    format: z.enum(ANNOTATION_QUEUE_COLUMN_FORMATS),
  })
  .refine(
    (column) =>
      column.source !== "trace" ||
      (ANNOTATION_QUEUE_TRACE_FIELDS as readonly string[]).includes(column.key),
    {
      message: `Trace field must be one of ${ANNOTATION_QUEUE_TRACE_FIELDS.join(", ")}`,
      path: ["key"],
    },
  );
export type AnnotationQueueDisplayColumn = z.infer<
  typeof AnnotationQueueDisplayColumn
>;

export const MAX_ANNOTATION_QUEUE_DISPLAY_COLUMNS = 20;

export const AnnotationQueueDisplayColumns = z
  .array(AnnotationQueueDisplayColumn)
  .max(MAX_ANNOTATION_QUEUE_DISPLAY_COLUMNS, {
    message: `A queue can have at most ${MAX_ANNOTATION_QUEUE_DISPLAY_COLUMNS} extra columns`,
  });

export const CreateQueueData = z.object({
  name: StringNoHTMLNonEmpty.max(35),
  description: StringNoHTML.max(1000).optional(),
  scoreConfigIds: z.array(z.string()).min(1, {
    message: "At least 1 score config must be selected",
  }),
  displayColumns: AnnotationQueueDisplayColumns.optional(),
});

export const CreateQueueWithAssignmentsData = CreateQueueData.extend({
  newAssignmentUserIds: z.array(z.string()),
});

export type CreateQueue = z.infer<typeof CreateQueueData>;
export type CreateQueueWithAssignments = z.infer<
  typeof CreateQueueWithAssignmentsData
>;
