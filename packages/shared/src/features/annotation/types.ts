import z from "zod/v4";
import { type ScoreDataType } from "../../db";
import { StringNoHTML, StringNoHTMLNonEmpty } from "../../utils/zod";

const NUMERIC: ScoreDataType = "NUMERIC";
const CATEGORICAL: ScoreDataType = "CATEGORICAL";
const BOOLEAN: ScoreDataType = "BOOLEAN";

export const availableDataTypes = [NUMERIC, CATEGORICAL, BOOLEAN] as const;

const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: z.literal("NUMERIC"),
});

const CategoricalData = z.object({
  value: z.number().nullish(),
  stringValue: z.string(),
  dataType: z.literal("CATEGORICAL"),
});

const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: z.literal("BOOLEAN"),
});

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
  projectId: z.string(),
  environment: z.string().default("default"),
  scoreTarget: ScoreTarget,
  configId: z.string(),
  comment: StringNoHTML.nullish(),
  queueId: z.string().nullish(),
  timestamp: z.date().optional(), // Required for ClickHouse deduplication
});

const UpdateAnnotationScoreBase = CreateAnnotationScoreBase.extend({
  id: z.string(),
});

/**
 * CreateAnnotationScoreData is only used for annotation scores created via the UI.
 * For langfuse score types please refer to `web/src/features/public-api/types/scores.ts`
 */
export const CreateAnnotationScoreData = z.discriminatedUnion("dataType", [
  CreateAnnotationScoreBase.merge(NumericData),
  CreateAnnotationScoreBase.merge(CategoricalData),
  CreateAnnotationScoreBase.merge(BooleanData),
]);

export type CreateAnnotationScoreData = z.infer<
  typeof CreateAnnotationScoreData
>;

/**
 * UpdateAnnotationScoreData is only used for annotation scores updated via the UI
 * For langfuse score types please refer to `web/src/features/public-api/types/scores.ts`
 */
export const UpdateAnnotationScoreData = z.discriminatedUnion("dataType", [
  UpdateAnnotationScoreBase.merge(NumericData),
  UpdateAnnotationScoreBase.merge(CategoricalData),
  UpdateAnnotationScoreBase.merge(BooleanData),
]);

export type UpdateAnnotationScoreData = z.infer<
  typeof UpdateAnnotationScoreData
>;

// annotation queues

export const CreateQueueData = z.object({
  name: StringNoHTMLNonEmpty.max(35),
  description: StringNoHTML.max(1000).optional(),
  scoreConfigIds: z.array(z.string()).min(1, {
    message: "At least 1 score config must be selected",
  }),
});

export const CreateQueueWithAssignmentsData = CreateQueueData.extend({
  newAssignmentUserIds: z.array(z.string()),
});

export type CreateQueue = z.infer<typeof CreateQueueData>;
export type CreateQueueWithAssignments = z.infer<
  typeof CreateQueueWithAssignmentsData
>;
