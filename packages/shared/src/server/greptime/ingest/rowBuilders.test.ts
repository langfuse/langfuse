import { describe, expect, it } from "vitest";

import {
  createObservation,
  createTrace,
  createTraceScore,
} from "../../test-utils/tracing-factory";
import { createDatasetRunItem } from "../../test-utils/tracing-factory";
import { GreptimeTable } from "./tableSchemas";
import {
  buildGreptimeRowsForRecord,
  observationRow,
  traceRow,
} from "./rowBuilders";

const tablesOf = (rows: { table: string }[]) => rows.map((r) => r.table);

describe("buildGreptimeRowsForRecord", () => {
  it("fans a trace out to projection + metadata + tags", () => {
    const trace = createTrace({
      project_id: "p1",
      id: "t1",
      timestamp: 1000,
      metadata: { env: "prod", region: "us" },
      tags: ["a", "b"],
      is_deleted: 0,
    });

    const out = buildGreptimeRowsForRecord(GreptimeTable.Traces, trace);
    expect(tablesOf(out)).toEqual(["traces", "traces_metadata", "traces_tags"]);

    const projection = out.find((o) => o.table === "traces")!;
    expect(projection.rows).toHaveLength(1);
    // JSON columns are serialized verbatim, booleans coerced.
    expect(projection.rows[0]).toMatchObject({
      project_id: "p1",
      id: "t1",
      timestamp: 1000,
      tags: JSON.stringify(["a", "b"]),
      metadata: JSON.stringify({ env: "prod", region: "us" }),
      is_deleted: false,
    });

    const metadata = out.find((o) => o.table === "traces_metadata")!;
    expect(metadata.rows).toEqual([
      {
        project_id: "p1",
        entity_id: "t1",
        key: "env",
        timestamp: 1000,
        value: "prod",
        is_deleted: false,
      },
      {
        project_id: "p1",
        entity_id: "t1",
        key: "region",
        timestamp: 1000,
        value: "us",
        is_deleted: false,
      },
    ]);

    const tags = out.find((o) => o.table === "traces_tags")!;
    expect(tags.rows).toEqual([
      {
        project_id: "p1",
        entity_id: "t1",
        tag: "a",
        timestamp: 1000,
        is_deleted: false,
      },
      {
        project_id: "p1",
        entity_id: "t1",
        tag: "b",
        timestamp: 1000,
        is_deleted: false,
      },
    ]);
  });

  it("omits empty EAV groups (no metadata, no tags)", () => {
    const trace = createTrace({
      project_id: "p1",
      id: "t2",
      metadata: {},
      tags: [],
    });
    const out = buildGreptimeRowsForRecord(GreptimeTable.Traces, trace);
    expect(tablesOf(out)).toEqual(["traces"]);
  });

  it("fans an observation out to projection + metadata only (no tags table)", () => {
    const obs = createObservation({
      project_id: "p1",
      id: "o1",
      start_time: 2000,
      metadata: { k: "v" },
    });
    const out = buildGreptimeRowsForRecord(GreptimeTable.Observations, obs);
    expect(tablesOf(out)).toEqual(["observations", "observations_metadata"]);
    // EAV timestamp for observations uses start_time, not timestamp.
    expect(out[1].rows[0]).toMatchObject({ timestamp: 2000, key: "k" });
  });

  it("fans a score out to projection + metadata only", () => {
    const score = createTraceScore({
      project_id: "p1",
      id: "s1",
      metadata: { reviewer: "alice" },
    });
    const out = buildGreptimeRowsForRecord(GreptimeTable.Scores, score);
    expect(tablesOf(out)).toEqual(["scores", "scores_metadata"]);
  });

  it("writes a dataset_run_item as a single projection row (no EAV)", () => {
    const dri = createDatasetRunItem({ project_id: "p1", id: "d1" });
    const out = buildGreptimeRowsForRecord(GreptimeTable.DatasetRunItems, dri);
    expect(tablesOf(out)).toEqual(["dataset_run_items"]);
    expect(out[0].rows).toHaveLength(1);
  });
});

describe("row mappers", () => {
  it("preserves the full usage/cost JSON maps and flattens total_cost", () => {
    const obs = createObservation({
      usage_details: { input: 10, output: 20, total: 30, cache_read: 5 },
      cost_details: { input: 1, output: 2, total: 3 },
      total_cost: 3,
    });
    const row = observationRow(obs);
    expect(row.usage_details).toBe(
      JSON.stringify({ input: 10, output: 20, total: 30, cache_read: 5 }),
    );
    expect(row.cost_details).toBe(
      JSON.stringify({ input: 1, output: 2, total: 3 }),
    );
    expect(row.total_cost).toBe(3);
    expect(row.input_cost).toBe(1);
    expect(row.output_cost).toBe(2);
  });

  it("coerces is_deleted to a boolean", () => {
    expect(traceRow(createTrace({ is_deleted: 1 })).is_deleted).toBe(true);
    expect(traceRow(createTrace({ is_deleted: 0 })).is_deleted).toBe(false);
  });
});
