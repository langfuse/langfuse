import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueueJobs } from "@langfuse/shared/src/server";
import { DlqRetryService } from "./dlqRetryService";
import { TableName } from "../ClickhouseWriter";
import type { Job } from "bullmq";

const {
  mockDeleteFiles,
  mockDownload,
  mockRecordIncrement,
  mockReplayDeadLetterRecords,
} = vi.hoisted(() => ({
  mockDeleteFiles: vi.fn().mockResolvedValue(undefined),
  mockDownload: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockReplayDeadLetterRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    getS3EventStorageClient: vi.fn(() => ({
      deleteFiles: mockDeleteFiles,
      download: mockDownload,
    })),
    recordIncrement: mockRecordIncrement,
  };
});

vi.mock("../ClickhouseWriter", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    ClickhouseWriter: {
      getInstance: vi.fn(() => ({
        replayDeadLetterRecords: mockReplayDeadLetterRecords,
      })),
    },
  };
});

describe("DlqRetryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replays persisted ClickhouseWriter records and removes the payload", async () => {
    const records = [{ id: "trace-1", project_id: "project-1" }];
    mockDownload.mockResolvedValueOnce(JSON.stringify(records));

    await DlqRetryService.replayClickhouseWriterRecords({
      name: QueueJobs.ClickhouseWriterDeadLetterJob,
      data: {
        payload: {
          tableName: TableName.Traces,
          fileKey: "clickhouse-writer-dlq/traces/batch.json",
        },
      },
    } as Job);

    expect(mockReplayDeadLetterRecords).toHaveBeenCalledWith(
      TableName.Traces,
      records,
    );
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.rows_replayed",
      1,
      { entity_type: TableName.Traces },
    );
    expect(mockDeleteFiles).toHaveBeenCalledWith([
      "clickhouse-writer-dlq/traces/batch.json",
    ]);
  });
});
