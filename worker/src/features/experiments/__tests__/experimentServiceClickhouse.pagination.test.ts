import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";

// Regression coverage for the dataset-experiment "config error" ingestion
// path: it must page through the dataset (bounded `getDatasetItems` calls)
// and submit bounded-size `processEventBatch` sub-batches instead of loading
// the whole dataset and submitting one unbounded batch. See
// `createAllDatasetRunItemsWithConfigError` in `../experimentServiceClickhouse.ts`.

const { mockGetDatasetItems, mockProcessEventBatch, mockQueryClickhouse } =
  vi.hoisted(() => ({
    mockGetDatasetItems: vi.fn(),
    mockProcessEventBatch: vi.fn(),
    mockQueryClickhouse: vi.fn(),
  }));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    getDatasetItems: mockGetDatasetItems,
    processEventBatch: mockProcessEventBatch,
    queryClickhouse: mockQueryClickhouse,
    redis: null,
    DatasetRunItemUpsertQueue: { getInstance: () => null },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock("../utils", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    // Force the "config error" path so we exercise
    // `createAllDatasetRunItemsWithConfigError` without needing a real
    // prompt/LLM-provider setup.
    validateAndSetupExperiment: vi
      .fn()
      .mockRejectedValue(new Error("simulated config error")),
  };
});

import {
  createExperimentJobClickhouse,
  DATASET_ITEMS_PAGE_SIZE,
} from "../experimentServiceClickhouse";

type FakeDatasetItem = {
  id: string;
  projectId: string;
  datasetId: string;
  input: Record<string, unknown>;
  expectedOutput: null;
  metadata: null;
  sourceTraceId: null;
  sourceObservationId: null;
  status: "ACTIVE";
  createdAt: Date;
  updatedAt: Date;
  validFrom: Date;
};

describe("createAllDatasetRunItemsWithConfigError pagination and batching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pages through a large dataset and submits bounded ingestion batches without dropping or duplicating items", async () => {
    const projectId = randomUUID();
    const datasetId = randomUUID();
    const runId = randomUUID();

    // Big enough to span 3 pages given DATASET_ITEMS_PAGE_SIZE.
    const totalItems = DATASET_ITEMS_PAGE_SIZE * 2 + 37;

    const items: FakeDatasetItem[] = Array.from(
      { length: totalItems },
      (_, i) => ({
        id: `item-${i}`,
        projectId,
        datasetId,
        input: { foo: `bar-${i}` },
        expectedOutput: null,
        metadata: null,
        sourceTraceId: null,
        sourceObservationId: null,
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        validFrom: new Date(),
      }),
    );

    mockGetDatasetItems.mockImplementation(
      async ({ limit, page }: { limit?: number; page?: number }) => {
        // Guard against a regression back to an unbounded fetch.
        expect(limit).toBe(DATASET_ITEMS_PAGE_SIZE);
        const start = (page ?? 0) * (limit ?? items.length);
        return items.slice(start, start + (limit ?? items.length));
      },
    );

    // No pre-existing dataset_run_items for this run.
    mockQueryClickhouse.mockResolvedValue([]);

    mockProcessEventBatch.mockImplementation(async (events: any[]) => ({
      successes: events.map((e) => ({ id: e.id, status: 200 })),
      errors: [],
    }));

    const result = await createExperimentJobClickhouse({
      event: { projectId, datasetId, runId },
    });

    expect(result).toEqual({ success: true });

    // Dataset was paged (at least 3 calls for 2*PAGE_SIZE + 37 items).
    expect(mockGetDatasetItems.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Every processEventBatch call must be bounded to at most one page's
    // worth of events (3 events per dataset item: run-item, trace, generation).
    expect(mockProcessEventBatch.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of mockProcessEventBatch.mock.calls) {
      const events = call[0] as any[];
      expect(events.length).toBeLessThanOrEqual(DATASET_ITEMS_PAGE_SIZE * 3);
    }

    // Every dataset item must produce exactly one run-item event - no items
    // dropped or duplicated across page boundaries.
    const processedDatasetItemIds = mockProcessEventBatch.mock.calls
      .flatMap((call) => call[0] as any[])
      .filter((event) => event.type === "dataset-run-item-create")
      .map((event) => event.body.datasetItemId);

    expect(processedDatasetItemIds.length).toBe(totalItems);
    expect(new Set(processedDatasetItemIds).size).toBe(totalItems);
  });
});
