import { describe, it, expect, vi, beforeEach } from "vitest";
import BackfillEventsFullFromDatasetRunItems from "../backgroundMigrations/backfillEventsFullFromDatasetRunItems";
import { clickhouseClient } from "@langfuse/shared/src/server";
import type { EnrichedSpan } from "../features/eventPropagation/handleExperimentBackfill";

const mockInsert = vi.fn();

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    clickhouseClient: vi.fn(() => ({
      insert: mockInsert,
    })),
  };
});

describe("BackfillEventsFullFromDatasetRunItems ClickHouse chunking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReset();
    mockInsert.mockResolvedValue(undefined);
  });

  function createMockSpan(id: number): EnrichedSpan {
    return {
      project_id: "proj-1",
      trace_id: "trace-1",
      span_id: `span-${id}`,
      parent_observation_id: null,
      type: "GENERATION",
      name: `gen-${id}`,
      start_time: "2026-01-01 00:00:00.000",
      end_time: null,
      environment: "production",
      version: null,
      release: "1.0.0",
      input: "large input data",
      output: "large output data",
      level: "DEFAULT",
      status_message: "",
      completion_start_time: null,
      prompt_id: "",
      prompt_name: "",
      prompt_version: null,
      model_id: "gpt-4",
      provided_model_name: "gpt-4",
      model_parameters: "{}",
      provided_usage_details: null,
      usage_details: null,
      provided_cost_details: null,
      cost_details: null,
      total_cost: 0,
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
      usage_pricing_tier_id: null,
      usage_pricing_tier_name: null,
      metadata: {},
      source: "API",
      tags: [],
      bookmarked: false,
      public: false,
      trace_name: "test-trace",
      user_id: "user-1",
      session_id: "session-1",
      experiment_id: "exp-1",
      experiment_name: "exp-name",
      experiment_metadata_names: [],
      experiment_metadata_values: [],
      experiment_description: "",
      experiment_dataset_id: "dataset-1",
      experiment_item_id: "item-1",
      experiment_item_version: null,
      experiment_item_root_span_id: "root-1",
      experiment_item_expected_output: "",
      experiment_item_metadata_names: [],
      experiment_item_metadata_values: [],
    };
  }

  it("partitions large span arrays into bounded chunks of at most 200 items", async () => {
    const migration = new BackfillEventsFullFromDatasetRunItems();
    const mockSpans = Array.from({ length: 450 }, (_, i) => createMockSpan(i));

    await (migration as any).insertEnrichedSpans(mockSpans);

    // 450 spans chunked at 200 should call clickhouseClient().insert 3 times (200, 200, 50)
    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(mockInsert.mock.calls[0][0].values).toHaveLength(200);
    expect(mockInsert.mock.calls[1][0].values).toHaveLength(200);
    expect(mockInsert.mock.calls[2][0].values).toHaveLength(50);
  });

  it("splits chunk recursively in half when ClickHouse insert throws RangeError: Invalid string length", async () => {
    const migration = new BackfillEventsFullFromDatasetRunItems();
    // 100 spans: first call throws RangeError, subsequent bisected calls succeed
    const mockSpans = Array.from({ length: 100 }, (_, i) => createMockSpan(i));

    let firstCall = true;
    mockInsert.mockImplementation(async () => {
      if (firstCall) {
        firstCall = false;
        throw new RangeError("Invalid string length");
      }
      return Promise.resolve();
    });

    await (migration as any).insertEnrichedSpans(mockSpans);

    // Initial 100 failed -> split into 50 and 50, both of which succeed (total 3 calls)
    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(mockInsert.mock.calls[0][0].values).toHaveLength(100);
    expect(mockInsert.mock.calls[1][0].values).toHaveLength(50);
    expect(mockInsert.mock.calls[2][0].values).toHaveLength(50);
  });
});
