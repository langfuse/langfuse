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

  it("removes metadata when ClickHouse returns empty map and metadata is not selected", async () => {
    // Simulates ClickHouse returning {} for an unselected Map column.
    const rows = [{ id: "obs-1", metadata: {} }];
    const results = await collect(
      enrichObservationStream(rowStream(rows), "project-1", "model_id", false, [
        "core",
      ] as any),
    );

    expect(results[0]).not.toHaveProperty("metadata");
  });
});
