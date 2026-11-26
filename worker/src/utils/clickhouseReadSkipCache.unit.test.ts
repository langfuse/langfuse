import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { logger } from "@langfuse/shared/src/server";
import type { PrismaClient } from "@langfuse/shared";
import { env } from "../env";
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
  });

  it("caches a missing project and warns once", async () => {
    findFirst.mockResolvedValue(null);
    const cache = ClickhouseReadSkipCache.getInstance(prisma);

    await expect(cache.isProjectMissing(MISSING_PROJECT_ID)).resolves.toBe(
      true,
    );
    await expect(cache.isProjectMissing(MISSING_PROJECT_ID)).resolves.toBe(
      true,
    );
    await expect(
      cache.shouldSkipClickHouseRead(MISSING_PROJECT_ID),
    ).resolves.toBe(false);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
