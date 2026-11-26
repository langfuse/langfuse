import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@langfuse/native", () => ({
  encodeClickhouseEvents: vi.fn(),
}));

import { logger } from "@langfuse/shared/src/server";
import type { PrismaClient } from "@langfuse/shared";
import { env } from "../env";
import { IngestionService } from "../services/IngestionService";
import { ClickhouseReadSkipCache } from "./clickhouseReadSkipCache";

const MISSING_PROJECT_ID = "project-deleted";

const findFirst = vi.fn();
const findMany = vi.fn();
const prisma = {
  project: { findFirst, findMany },
} as unknown as PrismaClient;

describe("ClickhouseReadSkipCache project lookup", () => {
  const originalCutoff =
    env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE;
  const originalProjectIds =
    env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS;

  beforeAll(() => {
    env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE =
      "2020-01-01";
    env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS = "";
    findMany.mockResolvedValue([]);
    vi.spyOn(logger, "debug").mockImplementation(() => logger);
    vi.spyOn(logger, "info").mockImplementation(() => logger);
    vi.spyOn(logger, "warn").mockImplementation(() => logger);
    vi.spyOn(logger, "error").mockImplementation(() => logger);
    ClickhouseReadSkipCache.getInstance(prisma);
  });

  afterAll(() => {
    env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE =
      originalCutoff;
    env.LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS =
      originalProjectIds;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    findFirst.mockClear();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
  });

  it("caches a missing project, warns once, and drops the ingestion job", async () => {
    findFirst.mockResolvedValue(null);
    const addToQueue = vi.fn();
    const query = vi.fn(() => {
      throw new Error("ClickHouse read should not run for a missing project");
    });
    const service = new IngestionService(
      {} as any,
      prisma,
      { addToQueue } as any,
      { query } as any,
    );

    const writeDeletedProject = () =>
      service.mergeAndWrite({
        eventType: "trace",
        projectId: MISSING_PROJECT_ID,
        entityId: "trace-1",
        createdAtTimestamp: new Date("2024-06-01T00:00:00.000Z"),
        events: [
          {
            id: "event-1",
            type: "trace-create",
            timestamp: "2024-06-01T00:00:00.000Z",
            body: {
              id: "trace-1",
              timestamp: "2024-06-01T00:00:00.000Z",
              name: "deleted-project-trace",
            },
          },
        ],
        forwardToEventsTable: false,
        attribution: {
          ingestionApiKey: "",
          ingestionSdkName: "test",
          ingestionSdkVersion: "0",
        },
      });

    await writeDeletedProject();
    await writeDeletedProject();

    expect(addToQueue).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
