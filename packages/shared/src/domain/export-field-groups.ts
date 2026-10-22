import {
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupFull,
} from "./observation-field-groups";

/**
 * Field groups of the scores blob export. Named with a `score_` prefix so they
 * never collide with an observation group of the same column (e.g. the
 * observation `metadata` group).
 *
 * Score groups are opt-in: they are not part of any default selection, so
 * existing exports keep their columns and size until a group is selected.
 */
export const SCORE_EXPORT_FIELD_GROUPS = [
  "score_metadata",
  "score_provenance",
] as const;

/**
 * Columns of every scores export row, in output order. Always exported, so
 * they are not a stored field group; settings show them as a locked "Core"
 * group. Optional group columns are appended after these.
 */
export const SCORE_EXPORT_CORE_FIELDS = [
  "id",
  "timestamp",
  "project_id",
  "environment",
  "trace_id",
  "observation_id",
  "session_id",
  "dataset_run_id",
  "name",
  "value",
  "source",
  "comment",
  "data_type",
  "string_value",
  "created_at",
  "updated_at",
] as const;

export type ScoreExportFieldGroup = (typeof SCORE_EXPORT_FIELD_GROUPS)[number];

/**
 * Columns each score group adds, appended after the core columns in
 * `SCORE_EXPORT_FIELD_GROUPS` order. Provenance holds the references to where
 * a score came from: author, score config, annotation queue, evaluator.
 */
export const SCORE_EXPORT_GROUP_FIELDS = {
  score_metadata: ["metadata"],
  score_provenance: [
    "author_user_id",
    "config_id",
    "queue_id",
    "evaluator_id",
    "evaluation_rule_id",
    "execution_trace_id",
  ],
} as const satisfies Record<ScoreExportFieldGroup, readonly string[]>;

/**
 * Every value that can be stored in an integration's `exportFieldGroups`.
 * Each group belongs to exactly one exported table; split a selection with
 * `getObservationFieldGroups` / `getScoreFieldGroups` before handing it to a
 * table's query.
 */
export const EXPORT_FIELD_GROUPS = [
  ...OBSERVATION_FIELD_GROUPS_FULL,
  ...SCORE_EXPORT_FIELD_GROUPS,
] as const;

export type ExportFieldGroup = (typeof EXPORT_FIELD_GROUPS)[number];

export const getObservationFieldGroups = (
  groups: readonly string[],
): ObservationFieldGroupFull[] =>
  groups.filter((group): group is ObservationFieldGroupFull =>
    (OBSERVATION_FIELD_GROUPS_FULL as readonly string[]).includes(group),
  );

export const getScoreFieldGroups = (
  groups: readonly string[],
): ScoreExportFieldGroup[] =>
  groups.filter((group): group is ScoreExportFieldGroup =>
    (SCORE_EXPORT_FIELD_GROUPS as readonly string[]).includes(group),
  );
