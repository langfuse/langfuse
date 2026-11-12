import { describe, expect, it, vi } from "vitest";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...mod,
    createModelCache: vi.fn().mockReturnValue({
      getModel: vi.fn().mockResolvedValue(null),
    }),
    enrichObservationWithModelData: vi.fn().mockReturnValue({
      modelId: null,
      inputPrice: null,
      outputPrice: null,
      totalPrice: null,
    }),
  };
});

import { enrichObservationStream } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
import type { ObservationFieldGroupFull } from "@langfuse/shared";

async function* rowStream(
  rows: Record<string, unknown>[],
): AsyncGenerator<Record<string, unknown>> {
  for (const row of rows) yield row;
}

async function collect(
  gen: AsyncGenerator<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const row of gen) out.push(row);
  return out;
}

describe("enrichObservationStream field group filtering", () => {
  it("does not add latency/time_to_first_token when row has no latency (metrics not selected)", async () => {
    // Simulates a row from ClickHouse where metrics group was not SELECTed —
    // latency and time_to_first_token are absent from the row entirely.
    const rows = [{ id: "obs-1" }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", true),
    );

    expect(results[0]).not.toHaveProperty("latency");
    expect(results[0]).not.toHaveProperty("time_to_first_token");
  });

  it("converts latency independently of time_to_first_token", async () => {
    // Guards are independent: a row with latency but no time_to_first_token
    // should convert latency and leave time_to_first_token out entirely.
    const rows = [{ id: "obs-1", latency: 2000 }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", true),
    );

    expect(results[0].latency).toBe(2);
    expect(results[0]).not.toHaveProperty("time_to_first_token");
  });

  it("removes metadata when ClickHouse returns empty map and metadata is not selected", async () => {
    // Simulates ClickHouse returning {} for an unselected Map column.
    const rows = [{ id: "obs-1", metadata: {} }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false, [
        "core" as ObservationFieldGroupFull,
      ]),
    );

    expect(results[0]).not.toHaveProperty("metadata");
  });

  it("does not add pricing fields when model group is not selected", async () => {
    const rows = [{ id: "obs-1" }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false, [
        "core" as ObservationFieldGroupFull,
      ]),
    );

    expect(results[0]).not.toHaveProperty("model_id");
    expect(results[0]).not.toHaveProperty("input_price");
    expect(results[0]).not.toHaveProperty("output_price");
    expect(results[0]).not.toHaveProperty("total_price");
  });

  it("does not add pricing fields when usage is selected without model", async () => {
    // model_export columns are not fetched when only usage is requested,
    // so there is no model_id to look up and no pricing to enrich.
    const rows = [{ id: "obs-1" }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false, [
        "core" as ObservationFieldGroupFull,
        "usage" as ObservationFieldGroupFull,
      ]),
    );

    expect(results[0]).not.toHaveProperty("model_id");
    expect(results[0]).not.toHaveProperty("provided_model_name");
    expect(results[0]).not.toHaveProperty("model_parameters");
    expect(results[0]).not.toHaveProperty("input_price");
    expect(results[0]).not.toHaveProperty("output_price");
    expect(results[0]).not.toHaveProperty("total_price");
  });

  it("adds pricing fields and preserves model_export columns when model group is selected", async () => {
    const rows = [
      {
        id: "obs-1",
        model_id: "gpt-4",
        provided_model_name: "gpt-4",
        model_parameters: { temperature: 0.7 },
      },
    ];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false, [
        "core" as ObservationFieldGroupFull,
        "model" as ObservationFieldGroupFull,
      ]),
    );

    expect(results[0]).toHaveProperty("model_id");
    expect(results[0]).toHaveProperty("provided_model_name");
    expect(results[0]).toHaveProperty("model_parameters");
    expect(results[0]).toHaveProperty("input_price");
    expect(results[0]).toHaveProperty("output_price");
    expect(results[0]).toHaveProperty("total_price");
  });

  it("adds pricing fields when both model and usage groups are selected", async () => {
    const rows = [{ id: "obs-1", model_id: "gpt-4" }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false, [
        "core" as ObservationFieldGroupFull,
        "model" as ObservationFieldGroupFull,
        "usage" as ObservationFieldGroupFull,
      ]),
    );

    expect(results[0]).toHaveProperty("model_id");
    expect(results[0]).toHaveProperty("input_price");
    expect(results[0]).toHaveProperty("output_price");
    expect(results[0]).toHaveProperty("total_price");
  });

  it("adds model pricing fields when fieldGroups is undefined (legacy v3 path)", async () => {
    // Legacy path: fieldGroups undefined means all fields included; model_id
    // passes through from the source row unchanged.
    const rows = [{ id: "obs-1", model_id: "gpt-4" }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false),
    );

    expect(results[0]).toHaveProperty("model_id");
    expect(results[0]).toHaveProperty("input_price");
    expect(results[0]).toHaveProperty("output_price");
    expect(results[0]).toHaveProperty("total_price");
  });
});

describe("enrichObservationStream skipEnrichment", () => {
  it("is byte-for-byte unchanged when skipEnrichment is false (default)", async () => {
    const rows = [
      { id: "obs-1", model_id: "gpt-4", latency: 2000, metadata: {} },
    ];
    const baseline = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", true, [
        "core" as ObservationFieldGroupFull,
        "model" as ObservationFieldGroupFull,
        "metrics" as ObservationFieldGroupFull,
      ]),
    );
    const explicitFalse = await collect(
      enrichObservationStream(
        rowStream(rows),
        "project-1",
        "model_id",
        true,
        [
          "core" as ObservationFieldGroupFull,
          "model" as ObservationFieldGroupFull,
          "metrics" as ObservationFieldGroupFull,
        ],
        false,
      ),
    );
    expect(explicitFalse).toEqual(baseline);
    // Pricing fields present (as null from the mock).
    expect(explicitFalse[0]).toHaveProperty("input_price");
    expect(explicitFalse[0]).toHaveProperty("output_price");
    expect(explicitFalse[0]).toHaveProperty("total_price");
  });

  it("drops only the three price fields when skipEnrichment is true", async () => {
    const rows = [
      { id: "obs-1", model_id: "gpt-4", latency: 2000, metadata: {} },
    ];
    const results = await collect(
      enrichObservationStream(
        rowStream(rows),
        "project-1",
        "model_id",
        true,
        [
          "core" as ObservationFieldGroupFull,
          "model" as ObservationFieldGroupFull,
          "metrics" as ObservationFieldGroupFull,
        ],
        true,
      ),
    );

    // Price fields dropped...
    expect(results[0]).not.toHaveProperty("input_price");
    expect(results[0]).not.toHaveProperty("output_price");
    expect(results[0]).not.toHaveProperty("total_price");
    // ...but model_id is preserved (it is a source column, not enrichment)...
    expect(results[0]).toHaveProperty("model_id");
    // ...and latency conversion (ms→s) still happens.
    expect(results[0].latency).toBe(2);
  });

  it("still cleans up the metadata map when skipEnrichment is true", async () => {
    const rows = [{ id: "obs-1", metadata: {} }];
    const results = await collect(
      enrichObservationStream(
        rowStream(rows),
        "project-1",
        "model_id",
        false,
        ["core" as ObservationFieldGroupFull],
        true,
      ),
    );
    expect(results[0]).not.toHaveProperty("metadata");
  });
});
