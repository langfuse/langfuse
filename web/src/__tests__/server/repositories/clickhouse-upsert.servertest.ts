const { mockInsert, mockUploadJson } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUploadJson: vi.fn(),
}));

vi.mock("../../../../../packages/shared/src/server/clickhouse/client", () => ({
  clickhouseClient: vi.fn(() => ({
    insert: mockInsert,
  })),
  convertDateToClickhouseDateTime: vi.fn(() => "2026-06-23 12:00:00"),
}));

vi.mock(
  "../../../../../packages/shared/src/server/services/StorageService",
  () => ({
    StorageServiceFactory: {
      getInstance: vi.fn(() => ({
        uploadJson: mockUploadJson,
      })),
    },
  }),
);

import { upsertClickhouse } from "../../../../../packages/shared/src/server/repositories/clickhouse";

describe("upsertClickhouse", () => {
  beforeEach(() => {
    mockInsert.mockResolvedValue({
      query_id: "query-id",
      response_headers: {},
    });
    mockUploadJson.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("encodes LiteLLM Responses API observation ids before using them in MinIO object keys", async () => {
    await upsertClickhouse({
      table: "observations",
      records: [
        {
          id: "time-2026-06-23T12:00:00.000Z_resp_dGVzdA=",
          project_id: "project-1",
          type: "GENERATION",
        },
      ],
      eventBodyMapper: (record) => ({ id: record.id }),
    });

    const uploadedPath = mockUploadJson.mock.calls[0][0];

    expect(uploadedPath).toContain(
      "project-1/observation/time-2026-06-23T12%3A00%3A00.000Z_resp_dGVzdA%3D/",
    );
    expect(uploadedPath).not.toContain("resp_dGVzdA=/");
    expect(uploadedPath).toMatch(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/,
    );
  });
});
