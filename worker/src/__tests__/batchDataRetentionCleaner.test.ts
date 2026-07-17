import { afterEach, beforeEach, expect, describe, it, vi } from "vitest";
import { randomUUID } from "crypto";
import {
  BatchDataRetentionCleaner,
  type BatchDataRetentionTable,
  TIMESTAMP_COLUMN_MAP,
} from "../features/batch-data-retention-cleaner";
import {
  clickhouseClient,
  commandClickhouse,
  createOrgProjectAndApiKey,
  createTracesCh,
  createTrace,
  createObservationsCh,
  createObservation,
  createScoresCh,
  createTraceScore,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

const integrationHooks = vi.hoisted(() => ({
  failExactEnrichmentForProjectId: null as string | null,
  failCandidateStreamAfterFirstRow: false,
  activeCandidateStreams: 0,
  candidateHttpTimeouts: [] as Array<{ send: number; receive: number }>,
  gaugeCalls: [] as Array<[stat: string, value: number | undefined]>,
  incrementCalls: [] as Array<[stat: string, value: number | undefined]>,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();

  return {
    ...actual,
    queryClickhouse: async <T>(
      opts: Parameters<typeof actual.queryClickhouse>[0],
    ) => {
      if (
        opts.query.includes("AS oldest_age_seconds") &&
        integrationHooks.failExactEnrichmentForProjectId !== null &&
        Object.values(opts.params ?? {}).includes(
          integrationHooks.failExactEnrichmentForProjectId,
        )
      ) {
        throw new Error("forced exact enrichment failure");
      }
      return actual.queryClickhouse<T>(opts);
    },
    queryClickhouseStream: async function* <T>(
      opts: Parameters<typeof actual.queryClickhouseStream>[0],
    ): AsyncGenerator<T> {
      if (opts.query.includes("SELECT DISTINCT project_id")) {
        integrationHooks.candidateHttpTimeouts.push({
          send: Number(
            opts.clickhouseConfigs?.clickhouse_settings?.http_send_timeout,
          ),
          receive: Number(
            opts.clickhouseConfigs?.clickhouse_settings?.http_receive_timeout,
          ),
        });
      }
      integrationHooks.activeCandidateStreams += 1;
      try {
        for await (const row of actual.queryClickhouseStream<T>(opts)) {
          yield row;
          if (integrationHooks.failCandidateStreamAfterFirstRow) {
            throw new Error("forced candidate stream failure");
          }
        }
      } finally {
        integrationHooks.activeCandidateStreams -= 1;
      }
    },
    recordGauge: (...args: Parameters<typeof actual.recordGauge>) => {
      integrationHooks.gaugeCalls.push([args[0], args[1]]);
      return actual.recordGauge(...args);
    },
    recordIncrement: (...args: Parameters<typeof actual.recordIncrement>) => {
      integrationHooks.incrementCalls.push([args[0], args[1]]);
      return actual.recordIncrement(...args);
    },
  };
});

async function getClickhouseCount(
  table: string,
  projectId: string,
): Promise<number> {
  const result = await queryClickhouse<{ count: number }>({
    query: `SELECT count() as count FROM ${table} FINAL WHERE project_id = {projectId: String}`,
    params: { projectId },
  });
  return Number(result[0]?.count ?? 0);
}

function retentionTestTableName(): string {
  return `batch_retention_${randomUUID().replaceAll("-", "")}`;
}

async function createRetentionTestTable(tableName: string): Promise<void> {
  await commandClickhouse({
    query: `
      CREATE TABLE ${tableName} (
        project_id String,
        start_time DateTime64(3),
        event_ts DateTime64(3)
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(start_time)
      ORDER BY (project_id, start_time)
    `,
  });
}

async function createProjectsWithRetention(count: number): Promise<string[]> {
  const projectIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });
    projectIds.push(projectId);
  }
  return projectIds;
}

async function insertRetentionTestRows(
  tableName: string,
  rows: Array<{ projectId: string; startTime: number }>,
): Promise<void> {
  await clickhouseClient().insert({
    table: tableName,
    format: "JSONEachRow",
    values: rows.map((row) => ({
      project_id: row.projectId,
      start_time: row.startTime,
      event_ts: row.startTime,
    })),
  });
}

async function getRetentionTestRowCount(tableName: string): Promise<number> {
  const result = await queryClickhouse<{ count: number }>({
    query: `
      SELECT count() AS count
      FROM ${tableName}
    `,
  });
  return Number(result[0]?.count ?? 0);
}

async function getRetentionTestProjectCount(
  tableName: string,
  projectId: string,
): Promise<number> {
  const result = await queryClickhouse<{ count: number }>({
    query: `
      SELECT count() AS count
      FROM ${tableName}
      WHERE project_id = {projectId: String}
    `,
    params: { projectId },
  });
  return Number(result[0]?.count ?? 0);
}

describe("BatchDataRetentionCleaner", () => {
  describe("processBatch - traces", () => {
    const TABLE = "traces" as const;

    it("should delete traces older than project retention", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert trace older than retention (10 days old)
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was deleted (10 days > 7 days retention)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(0);
    });

    it("should NOT delete traces within retention period", async () => {
      const now = Date.now();
      const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert trace within retention (5 days old)
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: fiveDaysAgo,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (5 days < 7 days retention)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });

    it("should handle projects with different retention times independently", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Project A: 7-day retention (10-day-old data should be deleted)
      const { projectId: projectA } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectA },
        data: { retentionDays: 7 },
      });
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectA,
          timestamp: tenDaysAgo,
        }),
        createTrace({
          id: randomUUID(),
          project_id: projectA,
          timestamp: now,
        }),
      ]);

      // Project B: 30-day retention (10-day-old data should be kept)
      const { projectId: projectB } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectB },
        data: { retentionDays: 30 },
      });
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectB,
          timestamp: tenDaysAgo,
        }),
        createTrace({
          id: randomUUID(),
          project_id: projectB,
          timestamp: thirtyDaysAgo,
        }),
      ]);

      // Verify both have data before deletion
      expect(await getClickhouseCount(TABLE, projectA)).toBe(2);
      expect(await getClickhouseCount(TABLE, projectB)).toBe(2);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Only now trace should remain in A
      expect(await getClickhouseCount(TABLE, projectA)).toBe(1);
      // Only tenDaysAgo trace should remain in B
      expect(await getClickhouseCount(TABLE, projectB)).toBe(1);
    });

    it("should not affect projects with retention disabled (null)", async () => {
      const now = Date.now();
      const old = now - 100 * 24 * 60 * 60 * 1000;

      // Create project without retention (null)
      const { projectId } = await createOrgProjectAndApiKey();
      // retentionDays is null by default

      // Insert trace older than typical retention
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: old,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (no retention policy)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });

    it("should not affect projects with retention set to 0", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with retentionDays = 0 (disabled)
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 0 },
      });

      // Insert trace older than typical retention
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (retention disabled)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });

    it("should not affect soft-deleted projects", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create soft-deleted project with retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: {
          retentionDays: 7,
          deletedAt: new Date(),
        },
      });

      // Insert trace
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (project is soft-deleted, handled by BatchProjectCleaner)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });
  });

  describe("processBatch - observations", () => {
    const TABLE = "observations" as const;

    it("should process observations correctly (uses start_time)", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert observation with old start_time
      await createObservationsCh([
        createObservation({
          id: randomUUID(),
          project_id: projectId,
          start_time: tenDaysAgo,
        }),
      ]);

      // Verify observation exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify observation was deleted
      expect(await getClickhouseCount(TABLE, projectId)).toBe(0);
    });
  });

  describe("processBatch - scores", () => {
    const TABLE = "scores" as const;

    it("should process scores correctly (uses timestamp)", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert score with old timestamp
      await createScoresCh([
        createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Verify score exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify score was deleted
      expect(await getClickhouseCount(TABLE, projectId)).toBe(0);
    });
  });

  describe("candidate discovery and fallback queries", () => {
    const timestampColumns = TIMESTAMP_COLUMN_MAP as Record<string, string>;
    let tableName: string;
    let table: BatchDataRetentionTable;
    let originalChunkSize: number;
    let originalProjectLimit: number;

    beforeEach(async () => {
      tableName = retentionTestTableName();
      table = tableName as BatchDataRetentionTable;
      originalChunkSize = env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE;
      originalProjectLimit =
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT;
      timestampColumns[tableName] = "start_time";
      integrationHooks.failExactEnrichmentForProjectId = null;
      integrationHooks.failCandidateStreamAfterFirstRow = false;
      integrationHooks.activeCandidateStreams = 0;
      integrationHooks.candidateHttpTimeouts = [];
      integrationHooks.gaugeCalls = [];
      integrationHooks.incrementCalls = [];
      await createRetentionTestTable(tableName);
    });

    afterEach(async () => {
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = originalChunkSize;
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT =
        originalProjectLimit;
      delete timestampColumns[tableName];
      await commandClickhouse({ query: `DROP TABLE IF EXISTS ${tableName}` });
    });

    it("discovers expired projects across every configured project chunk", async () => {
      const projectIds = await createProjectsWithRetention(3);
      await insertRetentionTestRows(
        tableName,
        projectIds.map((projectId) => ({
          projectId,
          startTime: Date.now() - 10 * 24 * 60 * 60 * 1000,
        })),
      );
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = 2;
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT = 3;

      await new BatchDataRetentionCleaner(table).processBatch();

      expect(await getRetentionTestRowCount(tableName)).toBe(0);
      expect(integrationHooks.incrementCalls).toContainEqual([
        "langfuse.batch_data_retention_cleaner.rows_matched_before_delete",
        3,
      ]);
      expect(integrationHooks.candidateHttpTimeouts.length).toBeGreaterThan(0);
      for (const timeouts of integrationHooks.candidateHttpTimeouts) {
        const expectedTimeoutSeconds = Math.ceil(
          env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS /
            1000,
        );
        expect(timeouts).toEqual({
          send: expectedTimeoutSeconds,
          receive: expectedTimeoutSeconds,
        });
      }
      expect(
        integrationHooks.gaugeCalls.findLast(
          ([stat]) =>
            stat ===
            "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
        )?.[1],
      ).toBeGreaterThan(0);
    });

    it("renews on progress and aborts when the final lease renewal fails", async () => {
      const [projectId] = await createProjectsWithRetention(1);
      await insertRetentionTestRows(tableName, [
        {
          projectId: projectId!,
          startTime: Date.now() - 10 * 24 * 60 * 60 * 1000,
        },
      ]);

      const cleaner = new BatchDataRetentionCleaner(table);
      let extendedDuringCandidateStream = false;
      const extend = vi.fn(async () => {
        const isCandidateStreamActive =
          integrationHooks.activeCandidateStreams > 0;
        extendedDuringCandidateStream ||= isCandidateStreamActive;
        return isCandidateStreamActive;
      });
      (
        cleaner as unknown as {
          lock: { extend: typeof extend };
        }
      ).lock.extend = extend;

      await cleaner.processBatch();

      expect(extendedDuringCandidateStream).toBe(true);
      expect(await getRetentionTestRowCount(tableName)).toBe(1);
      expect(integrationHooks.incrementCalls).toContainEqual([
        "langfuse.batch_data_retention_cleaner.delete_failures",
        1,
      ]);
    });

    it("retains candidates yielded before the stream fails", async () => {
      const [projectId] = await createProjectsWithRetention(1);
      await insertRetentionTestRows(tableName, [
        {
          projectId: projectId!,
          startTime: Date.now() - 10 * 24 * 60 * 60 * 1000,
        },
      ]);
      integrationHooks.failCandidateStreamAfterFirstRow = true;

      await new BatchDataRetentionCleaner(table).processBatch();

      expect(await getRetentionTestRowCount(tableName)).toBe(0);
      expect(integrationHooks.incrementCalls).toContainEqual([
        "langfuse.batch_data_retention_cleaner.candidate_query_failures",
        1,
      ]);
    });

    it("prioritizes unenriched candidates and estimates lag from their oldest partition", async () => {
      const [fallbackProjectId, exactProjectId] =
        await createProjectsWithRetention(2);
      const exactExpiredAt = Date.now() - 10 * 24 * 60 * 60 * 1000;
      await insertRetentionTestRows(tableName, [
        {
          projectId: fallbackProjectId!,
          startTime: new Date("2020-03-15T00:00:00.000Z").getTime(),
        },
        {
          projectId: fallbackProjectId!,
          startTime: new Date("2020-01-15T00:00:00.000Z").getTime(),
        },
        { projectId: exactProjectId!, startTime: exactExpiredAt },
        { projectId: exactProjectId!, startTime: exactExpiredAt - 1 },
        { projectId: exactProjectId!, startTime: exactExpiredAt - 2 },
      ]);
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = 1;
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT = 1;
      integrationHooks.failExactEnrichmentForProjectId = fallbackProjectId!;
      const beforeRun = Date.now();

      await new BatchDataRetentionCleaner(table).processBatch();

      const afterRun = Date.now();
      expect(
        await getRetentionTestProjectCount(tableName, fallbackProjectId!),
      ).toBe(0);
      expect(
        await getRetentionTestProjectCount(tableName, exactProjectId!),
      ).toBe(3);

      const lagGauge = integrationHooks.gaugeCalls.findLast(
        ([stat]) =>
          stat === "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
      );
      const partitionStart = new Date("2020-01-01T00:00:00.000Z").getTime();
      const retentionMs = 7 * 24 * 60 * 60 * 1000;
      const lagValue = lagGauge?.[1] ?? Number.NaN;

      expect(lagValue).toBeGreaterThanOrEqual(
        (beforeRun - retentionMs - partitionStart) / 1000,
      );
      expect(lagValue).toBeLessThanOrEqual(
        (afterRun - retentionMs - partitionStart) / 1000,
      );
      expect(integrationHooks.incrementCalls).toContainEqual([
        "langfuse.batch_data_retention_cleaner.row_count_unavailable",
        1,
      ]);
    });
  });
});
