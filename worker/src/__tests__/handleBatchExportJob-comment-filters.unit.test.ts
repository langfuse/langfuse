import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BatchExportFileFormat,
  BatchExportStatus,
  BatchExportTableName,
  type FilterCondition,
} from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  applyCommentFilters: vi.fn(),
  findBatchExport: vi.fn(),
  getEventsStream: vi.fn(),
  updateBatchExport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    batchExport: {
      findFirst: mocks.findBatchExport,
      update: mocks.updateBatchExport,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  applyCommentFilters: mocks.applyCommentFilters,
  getCurrentSpan: vi.fn(() => undefined),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sendBatchExportSuccessEmail: vi.fn(),
  StorageServiceFactory: {},
  streamTransformations: {},
}));

vi.mock("../env", () => ({
  env: { LANGFUSE_S3_BATCH_EXPORT_ENABLED: "true" },
}));

vi.mock("../features/database-read-stream/event-stream", () => ({
  getEventsStream: mocks.getEventsStream,
}));
vi.mock("../features/database-read-stream/getDatabaseReadStream", () => ({
  getDatabaseReadStreamPaginated: vi.fn(),
}));
vi.mock("../features/database-read-stream/observation-stream", () => ({
  getObservationStream: vi.fn(),
}));
vi.mock("../features/database-read-stream/trace-stream", () => ({
  getTraceStream: vi.fn(),
}));

import { prisma } from "@langfuse/shared/src/db";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";

const rawCommentFilter: FilterCondition[] = [
  {
    type: "string",
    column: "commentContent",
    operator: "contains",
    value: "review me",
  },
];
const resolvedCommentFilter: FilterCondition[] = [
  {
    type: "stringOptions",
    column: "id",
    operator: "any of",
    value: ["observation-1"],
  },
];

describe("event batch-export comment filter wiring", () => {
  const stopAfterStreamSelection = new Error("stop after stream selection");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEventsStream.mockRejectedValue(stopAfterStreamSelection);
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: resolvedCommentFilter,
      hasNoMatches: false,
      matchingIds: ["observation-1"],
    });
    mocks.findBatchExport.mockResolvedValue({
      createdAt: new Date(),
      status: BatchExportStatus.QUEUED,
      format: BatchExportFileFormat.JSONL,
      query: {
        tableName: BatchExportTableName.Events,
        filter: rawCommentFilter,
        orderBy: null,
      },
    });
  });

  it("resolves Events comments as observation comments before streaming", async () => {
    await expect(
      handleBatchExportJob({
        projectId: "project-1",
        batchExportId: "export-1",
      }),
    ).rejects.toBe(stopAfterStreamSelection);

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: rawCommentFilter,
      prisma,
      projectId: "project-1",
      objectType: "OBSERVATION",
    });
    expect(mocks.getEventsStream).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedCommentFilter }),
    );
  });
});
