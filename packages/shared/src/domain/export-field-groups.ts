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
export const SCORE_EXPORT_FIELD_GROUPS = ["score_metadata"] as const;

export type ScoreExportFieldGroup = (typeof SCORE_EXPORT_FIELD_GROUPS)[number];

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
