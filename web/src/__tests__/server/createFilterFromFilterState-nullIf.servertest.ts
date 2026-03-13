import { createFilterFromFilterState } from "@langfuse/shared/src/server";

/**
 * Unit tests for the emptyEqualsNull flag on filter classes, passed through
 * createFilterFromFilterState via UiColumnMapping.
 *
 * events_core stores parent_span_id as a non-nullable String — root events
 * have ''. When emptyEqualsNull is set, NullFilter treats '' and NULL as
 * equivalent.
 */
describe("createFilterFromFilterState with emptyEqualsNull", () => {
  const baseMapping = {
    uiTableName: "parentObservationId",
    uiTableId: "parentObservationId",
    type: "string",
  };

  // Column mapping with emptyEqualsNull (used by v2 query engine for nullIf dimensions)
  const withEmptyEqualsNull = {
    ...baseMapping,
    clickhouseTableName: "events_core",
    clickhouseSelect: "events_observations.parent_span_id",
    queryPrefix: "",
    emptyEqualsNull: true,
  };

  // Column mapping without emptyEqualsNull — standard NullFilter behavior
  const withoutFlag = {
    ...baseMapping,
    clickhouseTableName: "observations",
    clickhouseSelect: "observations.parent_observation_id",
    queryPrefix: "",
  };

  it.each<{
    desc: string;
    operator: "is null" | "is not null";
    mapping: typeof withEmptyEqualsNull;
    expected: string;
  }>([
    {
      desc: "emptyEqualsNull + is null → match '' and NULL",
      operator: "is null",
      mapping: withEmptyEqualsNull,
      expected:
        "(events_observations.parent_span_id = '' OR events_observations.parent_span_id IS NULL)",
    },
    {
      desc: "emptyEqualsNull + is not null → exclude '' and NULL",
      operator: "is not null",
      mapping: withEmptyEqualsNull,
      expected:
        "(events_observations.parent_span_id != '' AND events_observations.parent_span_id IS NOT NULL)",
    },
    {
      desc: "emptyEqualsNull + queryPrefix + is null",
      operator: "is null",
      mapping: { ...withEmptyEqualsNull, queryPrefix: "eo" },
      expected:
        "(eo.events_observations.parent_span_id = '' OR eo.events_observations.parent_span_id IS NULL)",
    },
    {
      desc: "no flag → standard NullFilter",
      operator: "is null",
      mapping: withoutFlag,
      expected: "observations.parent_observation_id is null",
    },
    {
      desc: "no flag + is not null → standard NullFilter",
      operator: "is not null",
      mapping: withoutFlag,
      expected: "observations.parent_observation_id is not null",
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
