/**
 * The row filter of the observations public API (v1 and v2 list, the v2
 * scan, the v1 count, the MCP observation tools): its simple query params
 * (`userId`, `fromStartTime`, `environment`, …) and its advanced `filter`
 * JSON as one conjunction over the events predicate source, compiled through
 * the events predicate (`compileEventsPredicate`) like the events table UI's
 * row conditions.
 *
 * Accepts native event columns only. Rejects with `InvalidRequestError` (a
 * 400): `positionInTrace` filters, columns without an events lowering
 * (scores, comments, topics), unknown columns, and, unless the caller allows
 * unindexed input/output filters, input/output filters of a type other than
 * `string` or without a `matches` / `=` input/output filter next to them.
 */
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import type { FilterStateCondition } from "../../../query-ast/filterStateCodec";
import {
  eventsPredicateSource,
  resolvePredicateSourceField,
} from "../../../query-ast/sources";
import type { EventsTableFilterState } from "../../../types";
import type { CompiledEventsCondition } from "../../repositories/events-predicate";
import { EVENTS_FIELD_LOWERINGS } from "../../repositories/events-predicate-fields";
import {
  compileEventsRowConditions,
  type StartTimeBounds,
} from "./events-observation-row-selection";
import { isFtsAcceleratedIoOperator } from "./fts";

/** The simple query params of the observations public API that filter rows. */
export type PublicApiObservationsFilterParams = {
  userId?: string;
  sessionId?: string;
  traceId?: string;
  name?: string;
  level?: string;
  type?: string;
  parentObservationId?: string;
  isRootObservation?: boolean;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  environment?: string | string[];
};

/**
 * The compiled row filter, the shape of `EventsRowConditions` without the
 * search.
 */
export type PublicApiObservationsFilter = {
  /**
   * The WHERE condition of every filter, `startTime` bounds included;
   * `undefined` without any filter.
   */
  events?: CompiledEventsCondition;
  /**
   * Whether the query must read `events_full`. Equals
   * `events?.requiresEventsFull`; hosts read this one.
   */
  requiresEventsFull: boolean;
  /**
   * The `startTime` bounds (epoch ms) every matching row lies within. `events`
   * already applies them; the v2 scan only plans its windows from them.
   */
  startTime: StartTimeBounds;
};

const IO_FIELD_IDS: ReadonlySet<string> = new Set(["input", "output"]);

const EVENTS_IO_FILTER_TYPE_ERROR =
  "Input/output filters only support filter type `string`.";

const EVENTS_IO_FILTER_OPERATOR_ERROR =
  "Input/output filters require at least one `matches` or `=` operator.";

/** The events field id `column` resolves to (id, label or alias). */
const fieldIdOf = (column: string): string | undefined =>
  resolvePredicateSourceField(eventsPredicateSource, column)?.id;

const stringEquals = (
  column: string,
  value: string | undefined,
): FilterStateCondition[] =>
  typeof value === "string"
    ? [{ column, type: "string", operator: "=", value }]
    : [];

const startTimeBound = (
  operator: ">=" | "<",
  value: string | undefined,
): FilterStateCondition[] =>
  typeof value === "string"
    ? [
        {
          column: "startTime",
          type: "datetime",
          operator,
          value: new Date(value),
        },
      ]
    : [];

/**
 * `environment` as an `any of` condition; a string is split at commas. An
 * empty list filters nothing.
 */
const environmentCondition = (
  value: string | string[] | undefined,
): FilterStateCondition[] => {
  const values = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(values) || values.length === 0) return [];
  return [
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: values,
    },
  ];
};

/**
 * The simple params as conditions, in this order: `userId`, `sessionId`,
 * `traceId`, `name`, `level`, `type`, `parentObservationId`,
 * `isRootObservation`, `fromStartTime` (`startTime >=`), `toStartTime`
 * (`startTime <`), `version`, `environment` (`any of`; a string is split at
 * commas, an empty list is no condition). Absent params are skipped.
 */
const simpleConditions = (
  params: PublicApiObservationsFilterParams,
): FilterStateCondition[] => [
  ...stringEquals("userId", params.userId),
  ...stringEquals("sessionId", params.sessionId),
  ...stringEquals("traceId", params.traceId),
  ...stringEquals("name", params.name),
  ...stringEquals("level", params.level),
  ...stringEquals("type", params.type),
  ...stringEquals("parentObservationId", params.parentObservationId),
  ...(typeof params.isRootObservation === "boolean"
    ? [
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: params.isRootObservation,
        } satisfies FilterStateCondition,
      ]
    : []),
  ...startTimeBound(">=", params.fromStartTime),
  ...startTimeBound("<", params.toStartTime),
  ...stringEquals("version", params.version),
  ...environmentCondition(params.environment),
];

/**
 * Throws `InvalidRequestError` for the first advanced filter the events
 * predicate cannot take: a `positionInTrace` filter, or a column that is
 * unknown or has no events lowering (scores, comments, topics).
 */
const assertNativeEventsFilters = (advanced: EventsTableFilterState) => {
  for (const filter of advanced) {
    if (filter.type === "positionInTrace") {
      throw new InvalidRequestError(
        "Filter type 'positionInTrace' is not available on this endpoint.",
      );
    }
    const id = fieldIdOf(filter.column);
    if (id === undefined || !EVENTS_FIELD_LOWERINGS[id]) {
      throw new InvalidRequestError(
        `Column ${filter.column} does not match a UI / CH table mapping.`,
      );
    }
  }
};

const ioFiltersOf = (advanced: EventsTableFilterState) =>
  advanced.filter((filter) => IO_FIELD_IDS.has(fieldIdOf(filter.column) ?? ""));

const assertStringIoFilters = (advanced: EventsTableFilterState) => {
  if (ioFiltersOf(advanced).some((filter) => filter.type !== "string")) {
    throw new InvalidRequestError(EVENTS_IO_FILTER_TYPE_ERROR);
  }
};

/**
 * Throws `InvalidRequestError` for input/output filters none of which uses
 * `matches` or `=`, the operators the `events_full` text index serves.
 */
const assertIndexedIoFilters = (advanced: EventsTableFilterState) => {
  const io = ioFiltersOf(advanced);
  if (
    io.length > 0 &&
    !io.some((filter) => isFtsAcceleratedIoOperator(filter.operator))
  ) {
    throw new InvalidRequestError(EVENTS_IO_FILTER_OPERATOR_ERROR);
  }
};

/**
 * The observations public API row filter for `projectId`. Advanced filters
 * come first, then the simple params; an advanced filter on a field drops
 * every simple param on that field, so an advanced `startTime` filter
 * replaces both `fromStartTime` and `toStartTime`.
 *
 * Throws `InvalidRequestError` (a 400) for an advanced filter that is a
 * `positionInTrace` filter, an unknown column, or a column without an events
 * lowering (scores, comments, topics). Unless `allowUnindexedIoFilters` is
 * set, also for input/output filters of a type other than `string`, or none
 * of which uses `matches` or `=`.
 */
export function compilePublicApiObservationsFilter({
  projectId,
  params,
  advancedFilters,
  allowUnindexedIoFilters = false,
}: {
  projectId: string;
  params: PublicApiObservationsFilterParams;
  advancedFilters?: EventsTableFilterState;
  allowUnindexedIoFilters?: boolean;
}): PublicApiObservationsFilter {
  const advanced = advancedFilters ?? [];
  if (!allowUnindexedIoFilters) assertStringIoFilters(advanced);
  assertNativeEventsFilters(advanced);
  if (!allowUnindexedIoFilters) assertIndexedIoFilters(advanced);

  const advancedFields = new Set(
    advanced.map((filter) => fieldIdOf(filter.column)),
  );
  const conditions: FilterStateCondition[] = [
    ...advanced,
    ...simpleConditions(params).filter(
      (condition) => !advancedFields.has(fieldIdOf(condition.column)),
    ),
  ];

  const { events, requiresEventsFull, startTime } = compileEventsRowConditions({
    projectId,
    filter: conditions,
  });
  return { events, requiresEventsFull, startTime };
}
