import {
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupFull,
} from "./observation-field-groups";

/**
 * Field groups of the legacy traces blob export, prefixed with `trace_` so they
 * never collide with an observation group of the same column. `trace_core` is
 * always exported; it is stored to mark the trace selection as configured.
 *
 * A selection without any trace group exports every trace column, so
 * integrations saved before trace groups existed keep their export unchanged.
 */
export const TRACE_EXPORT_FIELD_GROUPS = [
  "trace_core",
  "trace_io",
  "trace_metadata",
] as const;

export type TraceExportFieldGroup = (typeof TRACE_EXPORT_FIELD_GROUPS)[number];

/**
 * Columns of the traces export and the group each belongs to, in the column
 * order of the full export (kept stable so a full selection is unchanged).
 */
export const TRACE_EXPORT_FIELDS = [
  { field: "id", group: "trace_core" },
  { field: "timestamp", group: "trace_core" },
  { field: "name", group: "trace_core" },
  { field: "environment", group: "trace_core" },
  { field: "project_id", group: "trace_core" },
  { field: "metadata", group: "trace_metadata" },
  { field: "user_id", group: "trace_core" },
  { field: "session_id", group: "trace_core" },
  { field: "release", group: "trace_core" },
  { field: "version", group: "trace_core" },
  { field: "public", group: "trace_core" },
  { field: "bookmarked", group: "trace_core" },
  { field: "tags", group: "trace_core" },
  { field: "input", group: "trace_io" },
  { field: "output", group: "trace_io" },
  { field: "created_at", group: "trace_core" },
  { field: "updated_at", group: "trace_core" },
] as const satisfies readonly {
  field: string;
  group: TraceExportFieldGroup;
}[];

/**
 * Every value that can be stored in an integration's `exportFieldGroups`.
 * Each group belongs to exactly one exported table; split a selection with
 * `getObservationFieldGroups` / `getTraceFieldGroups` before handing it to a
 * table's query.
 */
export const EXPORT_FIELD_GROUPS = [
  ...OBSERVATION_FIELD_GROUPS_FULL,
  ...TRACE_EXPORT_FIELD_GROUPS,
] as const;

export type ExportFieldGroup = (typeof EXPORT_FIELD_GROUPS)[number];

export const getObservationFieldGroups = (
  groups: readonly string[],
): ObservationFieldGroupFull[] =>
  groups.filter((group): group is ObservationFieldGroupFull =>
    (OBSERVATION_FIELD_GROUPS_FULL as readonly string[]).includes(group),
  );

/** True when the selection configures the traces export (any trace group stored). */
export const hasTraceFieldGroups = (groups: readonly string[]): boolean =>
  groups.some((group) =>
    (TRACE_EXPORT_FIELD_GROUPS as readonly string[]).includes(group),
  );

/**
 * Trace groups to export: all of them when the selection holds no trace group,
 * otherwise the selected ones plus the always-exported `trace_core`.
 */
export const getTraceFieldGroups = (
  groups: readonly string[],
): TraceExportFieldGroup[] =>
  hasTraceFieldGroups(groups)
    ? TRACE_EXPORT_FIELD_GROUPS.filter(
        (group) => group === "trace_core" || groups.includes(group),
      )
    : [...TRACE_EXPORT_FIELD_GROUPS];
