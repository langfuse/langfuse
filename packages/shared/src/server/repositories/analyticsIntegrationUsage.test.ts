import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryClickhouseStream = vi.hoisted(() =>
  vi.fn(() => (async function* () {})()),
);

vi.mock("./clickhouse", () => ({
  queryClickhouse: vi.fn(),
  queryClickhouseStream: mockQueryClickhouseStream,
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

import { getGenerationsForAnalyticsIntegrations } from "./observations";

describe("analytics integration generation usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects input, output, and total units from usage details", async () => {
    await getGenerationsForAnalyticsIntegrations(
      "project-id",
      "Project",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T01:00:00.000Z"),
    ).next();

    expect(mockQueryClickhouseStream).toHaveBeenCalledOnce();
    const call = mockQueryClickhouseStream.mock.calls[0] as unknown as [
      { query: string },
    ];
    const { query } = call[0];

    expect(query).toContain("o.usage_details['input'] as input_tokens");
    expect(query).toContain("o.usage_details['output'] as output_tokens");
    expect(query).toContain("o.usage_details['total'] as total_tokens");
  });
});
