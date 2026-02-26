import { createFilterFromFilterState } from "@langfuse/shared/src/server";

/**
 * Unit tests for the parentObservationId null-filter special case in
 * createFilterFromFilterState (factory.ts).
 *
 * events_core stores parent_span_id as a non-nullable String — root events
 * have ''. The view layer may wrap this with nullIf(col, '') so the UI sees
 * NULL instead. The factory must detect the wrapper and emit IS NULL / IS NOT
 * NULL (not = '' / != '') when nullIf is present.
 */
describe("createFilterFromFilterState parentObservationId on events tables", () => {
  const baseMapping = {
    uiTableName: "parentObservationId",
    uiTableId: "parentObservationId",
    type: "string",
  };

  // Column mapping that mirrors eventsObservationsView (nullIf wrapper present)
  const withNullIf = {
    ...baseMapping,
    clickhouseTableName: "events_core",
    clickhouseSelect: "nullIf(events_observations.parent_span_id, '')",
    queryPrefix: "",
  };

  // Column mapping without nullIf (raw column, e.g. eventsTracesView)
  const withoutNullIf = {
    ...baseMapping,
    clickhouseTableName: "events_core",
    clickhouseSelect: "events_traces.parent_span_id",
    queryPrefix: "",
  };

  // Non-events table — should fall through to standard NullFilter
  const nonEvents = {
    ...baseMapping,
    clickhouseTableName: "observations",
    clickhouseSelect: "observations.parent_observation_id",
    queryPrefix: "",
  };

  it.each<{
    desc: string;
    operator: "is null" | "is not null";
    mapping: typeof withNullIf;
    expected: string;
  }>([
    {
      desc: "nullIf + is null → IS NULL",
      operator: "is null",
      mapping: withNullIf,
      expected: "nullIf(events_observations.parent_span_id, '') IS NULL",
    },
    {
      desc: "nullIf + is not null → IS NOT NULL",
      operator: "is not null",
      mapping: withNullIf,
      expected: "nullIf(events_observations.parent_span_id, '') IS NOT NULL",
    },
    {
      desc: "raw column + is null → = ''",
      operator: "is null",
      mapping: withoutNullIf,
      expected: "events_traces.parent_span_id = ''",
    },
    {
      desc: "raw column + is not null → != ''",
      operator: "is not null",
      mapping: withoutNullIf,
      expected: "events_traces.parent_span_id != ''",
    },
    {
      desc: "raw column + queryPrefix",
      operator: "is null",
      mapping: { ...withoutNullIf, queryPrefix: "eo" },
      expected: "eo.events_traces.parent_span_id = ''",
    },
    {
      desc: "non-events table falls through to standard NullFilter",
      operator: "is null",
      mapping: nonEvents,
      expected: "observations.parent_observation_id is null",
    },
  ])("$desc", ({ operator, mapping, expected }) => {
    const filter = {
      type: "null" as const,
      column: "parentObservationId",
      operator,
      value: "" as const,
    };
    const [result] = createFilterFromFilterState([filter], [mapping]);
    const { query, params } = result.apply();
    expect(query).toBe(expected);
    expect(params).toEqual({});
  });
});
