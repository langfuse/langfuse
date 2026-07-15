import { describe, expect, it } from "vitest";

import {
  buildEventsFullTableSplitQuery,
  EventsQueryBuilder,
  EventsSessionAggregationQueryBuilder,
} from "./event-query-builder";

describe("EventsSessionAggregationQueryBuilder", () => {
  it("selects metadata arrays from the same deterministic latest observation", () => {
    const { query } = new EventsSessionAggregationQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("metadata")
      .buildWithParams();

    expect(query).toContain(
      "argMax(metadata_names, tuple(start_time, event_ts, span_id)) AS metadata_names",
    );
    expect(query).toContain(
      "argMax(metadata_values, tuple(start_time, event_ts, span_id)) AS metadata_values",
    );
    expect(query).toContain("e.project_id = {projectId: String}");
  });

  it("omits metadata aggregation from the base field set", () => {
    const { query } = new EventsSessionAggregationQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("base")
      .buildWithParams();

    expect(query).not.toContain("metadata_names");
    expect(query).not.toContain("metadata_values");
  });
});

describe("EventsQueryBuilder.selectIOWithSizeCap", () => {
  const build = () =>
    new EventsQueryBuilder({ projectId: "test-project" })
      .selectFieldSet("base", "calculated", "metadata")
      .selectIOWithSizeCap(300_000, 4_000)
      .whereRaw("e.trace_id = {traceId: String}", { traceId: "trace-1" })
      .buildWithParams();

  it("returns full fields under the cap and a preview head above it", () => {
    const { query } = build();

    // lengthUTF8() is computed in the query on purpose: the materialized
    // input_length/output_length columns cannot be assumed present on every
    // deployment's events_full, and the full column is read here anyway.
    expect(query).toContain(
      "if(lengthUTF8(e.input) <= 300000, e.input, leftUTF8(e.input, 4000)) as input",
    );
    expect(query).toContain(
      "if(lengthUTF8(e.output) <= 300000, e.output, leftUTF8(e.output, 4000)) as output",
    );
  });

  it("exposes the true lengths so callers can detect previews", () => {
    const { query } = build();

    expect(query).toContain("lengthUTF8(e.input) as input_length");
    expect(query).toContain("lengthUTF8(e.output) as output_length");
  });

  it("caps metadata values with the same policy and flags truncation", () => {
    const { query } = build();

    expect(query).toContain(
      "arrayMap(v -> if(lengthUTF8(v) <= 300000, v, leftUTF8(v, 4000)), arrayReverse(e.metadata_values))",
    );
    // The flag only fires for a key's winning value (a shadowed duplicate
    // must not raise it), and the shipped weight counts every capped value.
    expect(query).toContain(
      "arrayExists((v, i) -> lengthUTF8(v) > 300000 AND arrayFirstIndex(n -> n = e.metadata_names[i], e.metadata_names) = i, e.metadata_values, arrayEnumerate(e.metadata_values)) as metadata_truncated",
    );
    expect(query).toContain(
      "arraySum(arrayMap(v -> if(lengthUTF8(v) <= 300000, lengthUTF8(v), 4000), e.metadata_values)) as metadata_length",
    );
    // The default full-value metadata expression must not also be present.
    expect(query).not.toContain(
      "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) as metadata",
    );
  });

  it("reads events_full (true lengths + full under-cap values)", () => {
    const { query } = build();

    expect(query).toContain("FROM events_full");
  });
});

describe("buildEventsFullTableSplitQuery", () => {
  const buildBase = () =>
    new EventsQueryBuilder({ projectId: "test-project" })
      .selectFieldSet("core")
      .whereRaw("e.trace_id = {traceId: String}", { traceId: "trace-1" })
      .orderByColumns([{ column: "e.start_time", direction: "DESC" }])
      .limit(51, undefined);

  it("joins the io CTE with LEFT ANY JOIN (no row fan-out)", () => {
    const { query } = buildEventsFullTableSplitQuery({
      projectId: "test-project",
      baseBuilder: buildBase(),
      includeIO: true,
      includeMetadata: true,
    }).buildWithParams();

    // ANY takes exactly one matching io row per base row, preventing the
    // N_base x N_io amplification a plain LEFT JOIN produces on un-merged
    // ReplacingMergeTree duplicates.
    expect(query).toContain(
      'LEFT ANY JOIN io i ON b."start_time" = i."_io_start_time"',
    );
    expect(query).not.toMatch(/\bLEFT JOIN io\b/);
    // io columns come from the joined events_full CTE.
    expect(query).toContain("i.input as input");
    expect(query).toContain("i.output as output");
    expect(query).toContain("i.metadata as metadata");
  });
});
