import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicSummary } from "../../topics";
import {
  listTopicSummaries,
  readTopicSummaries,
  writeTopicSummaries,
} from "./clickhouse";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), query: vi.fn() }));
vi.mock("../clickhouse/client", () => ({
  clickhouseClient: () => ({ insert: mocks.insert }),
  convertDateToClickhouseDateTime: (date: Date) => date.toISOString(),
}));
vi.mock("../clickhouse/queryTags", () => ({
  buildClickHouseLogComment: () => "{}",
}));
vi.mock("../repositories/clickhouse", () => ({ queryClickhouse: mocks.query }));

beforeEach(() => vi.resetAllMocks());

describe("Topics summary provenance storage", () => {
  it("reads a bounded trace cohort across versions of only the selected project and facet", async () => {
    mocks.query.mockResolvedValue([]);
    await listTopicSummaries("project-a", {
      facetId: "facet-a",
      traceIds: ["trace-a"],
    });
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      traceIds: ["trace-a"],
    });
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("facet_id = {facetId:String}");
    expect(query).toContain("unit_id IN ({traceIds:Array(String)})");
    expect(query).not.toContain("AND facet_version_id =");
    await expect(
      listTopicSummaries("project-a", { facetId: "facet-a" }),
    ).rejects.toThrow("explicit bounded cohort");
  });

  it("writes and reads trace identity and manual-trigger provenance", async () => {
    const summary: TopicSummary = {
      id: "summary-a",
      projectId: "project-a",
      facetId: "facet-a",
      facetVersionId: "facet-v1",
      facetVersion: 1,
      traceId: "trace-a",
      unitType: "trace",
      triggerType: "manual_poc",
      traceTimestamp: "2026-09-16T00:00:00.000Z",
      revision: "1",
      executionId: "execution-a",
      resultVersion: 2,
      state: "complete",
      summary: "Requests an invoice",
      embedding: [0.1, 0.2],
      inputHash: "input",
      snapshotHash: "snapshot",
      invocationHash: "invocation",
      summaryModel: "gpt-4.1-nano",
      embeddingModel: "text-embedding-3-small",
      inputTokens: 10,
      outputTokens: 5,
      embeddingTokens: 5,
      summaryCostUsd: 0.001,
      embeddingCostUsd: 0.0001,
      processedAt: "2026-09-16T00:01:00.000Z",
      metadata: {},
    };
    await writeTopicSummaries([summary]);
    const inserted = mocks.insert.mock.calls[0][0].values[0];
    expect(inserted).toMatchObject({
      project_id: "project-a",
      unit_id: "trace-a",
      unit_type: "trace",
      trigger_type: "manual_poc",
    });
    mocks.query.mockResolvedValue([
      {
        ...summary,
        traceTimestampMs: Date.parse(summary.traceTimestamp).toString(),
        processedAtMs: Date.parse(summary.processedAt).toString(),
        metadataJson: "{}",
      },
    ]);
    expect(await readTopicSummaries("project-a", ["summary-a"])).toEqual([
      summary,
    ]);
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "unit_type AS unitType",
    );
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "trigger_type AS triggerType",
    );
  });
});
