import { describe, expect, it, vi } from "vitest";
import { parseMetadataCHRecordToDomain } from "../../../packages/shared/src/server/utils/metadata_conversion";

const chainableQueryBuilder = {
  selectFieldSet: vi.fn().mockReturnThis(),
  selectIO: vi.fn().mockReturnThis(),
  buildWithParams: vi.fn(() => ({ query: "SELECT 1", params: {} })),
};

const mocks = vi.hoisted(() => ({
  queryClickhouseStream: vi.fn(),
}));

vi.mock("../env", () => ({
  env: { BATCH_EXPORT_ROW_LIMIT: 1_000_000 },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {},
}));

vi.mock("@langfuse/shared/src/server", () => ({
  buildEventsStreamQuery: vi.fn(() => ({
    queryBuilder: chainableQueryBuilder,
  })),
  buildEventsBlobExportStreamQuery: vi.fn(),
  getDistinctScoreNames: vi.fn(),
  parseMetadataCHRecordToDomain,
  queryClickhouseStream: mocks.queryClickhouseStream,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { getEventsStreamForDataset } from "../features/database-read-stream/event-stream";

describe("getEventsStreamForDataset metadata parsing", () => {
  it("parses JSON-string metadata values into objects/arrays, like the read API does", async () => {
    mocks.queryClickhouseStream.mockReturnValue(
      (async function* () {
        yield {
          id: "obs-1",
          trace_id: "trace-1",
          input: null,
          output: "some output text",
          metadata: {
            config: '{"name":"example"}',
            events: '[{"kind":"a","text":"hello"},{"kind":"b"}]',
            label: "plain-string",
          },
        };
      })(),
    );

    const stream = await getEventsStreamForDataset({
      projectId: "project-1",
      cutoffCreatedAt: new Date(),
      filter: [],
      rowLimit: 100,
    });

    const rows: Array<{ metadata: unknown }> = [];
    for await (const row of stream) {
      rows.push(row as { metadata: unknown });
    }

    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({
      config: { name: "example" },
      events: [{ kind: "a", text: "hello" }, { kind: "b" }],
      label: "plain-string",
    });
  });
});
