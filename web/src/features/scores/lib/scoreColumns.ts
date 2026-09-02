import { type VisibilityState } from "@tanstack/react-table";
import {
  ScoreDataTypeArray,
  ScoreSourceArray,
  type ScoreAggregate,
  type FilterCondition,
  type ScoreDataTypeType,
  type ScoreSourceType,
} from "@langfuse/shared";

const traceLevelScoreFilter = (): FilterCondition[] => [
  {
    type: "null",
    column: "traceId",
    operator: "is not null",
    value: "",
  },
  {
    type: "null",
    column: "observationId",
    operator: "is null",
    value: "",
  },
];

/**
 * Scope helpers for score discovery.
 *
 * - Trace-level: scores written directly to the trace. These have a `traceId`
 *   and no `observationId`.
 * - Trace-scoped: any score row attached to a trace. This includes trace-level
 *   scores plus observation-level scores whose observations belong to the
 *   trace.
 * - Aggregate: the UI groups all score rows returned for a given scope by
 *   `name/source/dataType` and renders one aggregate column per group.
 */
export const scoreFilters = {
  // Scores written directly to the trace itself.
  forTraceLevel: traceLevelScoreFilter,

  // Historical alias for trace-level semantics. Prefer `forTraceLevel`.
  forTraces: traceLevelScoreFilter,

  // Any score row that rolls up into a trace aggregate column.
  forTraceScopedAggregates: (): FilterCondition[] => [
    {
      type: "null",
      column: "traceId",
      operator: "is not null",
      value: "",
    },
  ],

  // Filter for session level scores
  forSessions: (): FilterCondition[] => [
    {
      type: "null",
      column: "traceId",
      operator: "is null",
      value: "",
    },
    {
      type: "null",
      column: "sessionId",
      operator: "is not null",
      value: "",
    },
  ],

  // Filter for observation level scores
  forObservations: (): FilterCondition[] => [
    {
      type: "null",
      column: "observationId",
      operator: "is not null",
      value: "",
    },
  ],

  // Filter for dataset run level scores
  forDatasetRuns: ({
    datasetRunIds,
  }: {
    datasetRunIds: string[];
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetRunIds",
      operator: "any of",
      value: datasetRunIds,
    },
  ],

  // Filter for dataset run item scores via dataset_run_items_rmt
  forDatasetRunItems: ({
    datasetRunIds,
    datasetId,
  }: {
    datasetRunIds: string[];
    datasetId: string;
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetRunItemRunIds",
      operator: "any of",
      value: datasetRunIds,
    },
    {
      type: "string",
      column: "datasetId",
      operator: "=",
      value: datasetId,
    },
  ],

  // Filter for dataset item scores via dataset_run_items_rmt
  forDatasetItems: ({
    datasetItemIds,
    datasetId,
  }: {
    datasetItemIds: string[];
    datasetId: string;
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetItemIds",
      operator: "any of",
      value: datasetItemIds,
    },
    {
      type: "string",
      column: "datasetId",
      operator: "=",
      value: datasetId,
    },
  ],

  // Filter for experiment item scores (trace-based scores via events_core)
  forExperimentItems: ({
    experimentIds,
  }: {
    experimentIds: string[];
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "experimentIds",
      operator: "any of",
      value: experimentIds,
    },
  ],
};

export const addPrefixToScoreKeys = (
  scores: ScoreAggregate,
  prefix: string,
) => {
  const prefixed: ScoreAggregate = {};
  for (const [key, value] of Object.entries(scores)) {
    prefixed[`${prefix}-${key}`] = value;
  }
  return prefixed;
};

/**
 * Aggregate keys that carry a value somewhere in the current result set. Used
 * to drop score columns that would render empty for every visible row.
 */
export const collectPresentScoreKeys = (
  aggregates: (ScoreAggregate | null | undefined)[],
): Set<string> => {
  const presentKeys = new Set<string>();
  for (const aggregate of aggregates) {
    if (!aggregate) continue;
    for (const key of Object.keys(aggregate)) presentKeys.add(key);
  }
  return presentKeys;
};

/**
 * Keeps only the score columns that have a value in the current result set.
 * Pass `undefined` while the score data is still loading, so columns are not
 * dropped and re-added on every fetch.
 */
export const withPresentScoreKeys = <T extends { key: string }>(
  scoreColumns: T[],
  presentKeys: ReadonlySet<string> | undefined,
): T[] =>
  presentKeys
    ? scoreColumns.filter(({ key }) => presentKeys.has(key))
    : scoreColumns;

/**
 * Recognises a persisted score-column id without knowing which level prefixes
 * a table uses. Score columns are keyed `<name>-<SOURCE>-<DATATYPE>`, some
 * levels behind a prefix (`Trace-…`). Score names have their `-` and `.`
 * normalised to `_`, and both trailing segments come from closed enums, so the
 * suffix identifies a score column while ordinary column ids (`itemCount`,
 * `startTime`) never match.
 */
const isScoreColumnId = (columnId: string): boolean => {
  const segments = columnId.split("-");
  if (segments.length < 3) return false;
  const [source, dataType] = segments.slice(-2);
  return (
    (ScoreSourceArray as readonly string[]).includes(source) &&
    (ScoreDataTypeArray as readonly string[]).includes(dataType)
  );
};

/**
 * One-time transform that opts a returning user into score columns being
 * visible by default. Their stored visibility state already holds `false` for
 * every score column from the previous default, so changing `defaultHidden`
 * alone would only ever reach new users. Only acts on that stale default: as
 * soon as one score column is enabled the user has made their own choice and
 * their layout is left untouched. Returns `null` while no score column is known
 * yet (they arrive with the score-column query) so the migration is retried
 * instead of being consumed against an empty column set.
 *
 * `scoreColumnIds` only covers the page in view, while this runs once and for
 * good, so every score column the stored state already holds is revealed too.
 * Otherwise a score first met on a later page would keep its stale `false`
 * forever. A column the user has never seen carries no stored entry and picks
 * up the new default on its own. Hiding score columns that are empty for the
 * rows in view is a separate, per-result-set decision — `withPresentScoreKeys`
 * makes it, and widening the reveal does not disturb it.
 */
export const revealScoreColumns = (
  visibility: VisibilityState,
  scoreColumnIds: string[],
): VisibilityState | null => {
  if (scoreColumnIds.length === 0) return null;
  const revealedIds = Array.from(
    new Set([
      ...scoreColumnIds,
      ...Object.keys(visibility).filter(isScoreColumnId),
    ]),
  );
  if (revealedIds.some((id) => visibility[id])) return visibility;
  return {
    ...visibility,
    ...Object.fromEntries(revealedIds.map((id) => [id, true])),
  };
};

/**
 * What a score's data type means for how its values read. Spelled out because a
 * numeric score whose values happen to be 0 and 1 is otherwise indistinguishable
 * from a boolean one, and a user read her own data wrong because of it.
 */
export const getScoreDataTypeExplanation = (
  dataType: ScoreDataTypeType,
): string => {
  switch (dataType) {
    case "BOOLEAN":
      return "Boolean score. Stored as true / false and summarised as the share of items that are true.";
    case "CATEGORICAL":
      return "Categorical score. Its values have no order, so there is no average — the most frequent value stands for the group instead.";
    case "TEXT":
      return "Text score. Free-form, so it is neither averaged nor ordered.";
    case "CORRECTION":
      return "Correction. A human-supplied replacement for a value rather than a measurement.";
    case "NUMERIC":
    default:
      return "Numeric score. Averaged across the items. A numeric score that only ever holds 0 or 1 is still numeric — it is not a boolean, and 1 does not mean true.";
  }
};

export const getScoreDataTypeIcon = (dataType: ScoreDataTypeType): string => {
  switch (dataType) {
    case "NUMERIC":
    default:
      return "#";
    case "CATEGORICAL":
      return "Ⓒ";
    case "BOOLEAN":
      return "Ⓑ";
    case "CORRECTION":
      return "";
    case "TEXT":
      return "Aa";
  }
};

// Utility function (could go in a utils file)
export const convertScoreColumnsToAnalyticsData = (
  scoreColumns:
    | {
        key: string;
        name: string;
        dataType: ScoreDataTypeType;
        source: ScoreSourceType;
      }[]
    | undefined,
) => {
  const scoreAnalyticsOptions =
    scoreColumns?.map(({ key, name, dataType, source }) => ({
      key,
      value: `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
    })) ?? [];

  return {
    scoreAnalyticsOptions,
    scoreKeyToData: new Map(scoreColumns?.map((obj) => [obj.key, obj]) ?? []),
  };
};
