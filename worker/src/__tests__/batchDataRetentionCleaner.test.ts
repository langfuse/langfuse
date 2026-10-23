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
  toClickhouseDateTime,
  traceException,
} from "@langfuse/shared/src/server";
import { isEnterpriseLicenseAvailable } from "@langfuse/shared/src/server/ee/licenseCheck";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

vi.mock("@langfuse/shared/src/server/ee/licenseCheck", () => ({
  isEnterpriseLicenseAvailable: vi.fn(() => true),
}));

const integrationHooks = vi.hoisted(() => ({
  failExactEnrichmentForProjectId: null as string | null,
  failExactEnrichmentOnReadOnly: true,
  omitExactEnrichmentForProjectId: null as string | null,
  failCandidateStreamAfterFirstRow: false,
  activeCandidateStreams: 0,
  candidateHttpTimeouts: [] as Array<{ send: number; receive: number }>,
  candidateQueries: [] as Array<{
    query: string;
    params: Record<string, unknown> | undefined;
  }>,
  deleteQueries: [] as Array<{ query: string }>,
  exactEnrichmentRequests: [] as Array<{
    projectIds: string[];
    preferredClickhouseService: string | undefined;
    requestTimeout: number | undefined;
  }>,
  gaugeCalls: [] as Array<[stat: string, value: number | undefined]>,
  incrementCalls: [] as Array<[stat: string, value: number | undefined]>,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();

  return {
    ...actual,
    commandClickhouse: async (
      opts: Parameters<typeof actual.commandClickhouse>[0],
    ) => {
      if (opts.query.startsWith("DELETE FROM")) {
        integrationHooks.deleteQueries.push({
          query: opts.query,
        });
      }
      return actual.commandClickhouse(opts);
    },
    queryClickhouse: async <T>(
      opts: Parameters<typeof actual.queryClickhouse>[0],
    ) => {
      const candidateProjectIds = opts.params?.candidateProjectIds;
      if (!opts.query.includes("AS oldest_timestamp")) {
        return actual.queryClickhouse<T>(opts);
      }

      integrationHooks.exactEnrichmentRequests.push({
        projectIds: Array.isArray(candidateProjectIds)
          ? candidateProjectIds.map(String)
          : [],
        preferredClickhouseService: opts.preferredClickhouseService,
        requestTimeout: opts.clickhouseConfigs?.request_timeout,
      });
      if (
        integrationHooks.failExactEnrichmentForProjectId !== null &&
        Array.isArray(candidateProjectIds) &&
        candidateProjectIds.includes(
          integrationHooks.failExactEnrichmentForProjectId,
        ) &&
        (opts.preferredClickhouseService === undefined ||
          integrationHooks.failExactEnrichmentOnReadOnly)
      ) {
        throw new Error("forced exact enrichment failure");
      }
      const result = await actual.queryClickhouse<T>(opts);
      return integrationHooks.omitExactEnrichmentForProjectId === null
        ? result
        : result.filter(
            (row) =>
              (row as { project_id?: string }).project_id !==
              integrationHooks.omitExactEnrichmentForProjectId,
          );
    },
    queryClickhouseStream: async function* <T>(
      opts: Parameters<typeof actual.queryClickhouseStream>[0],
    ): AsyncGenerator<T> {
      if (opts.query.includes("SELECT DISTINCT project_id")) {
        integrationHooks.candidateQueries.push({
          query: opts.query,
          params: opts.params,
        });
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
    traceException: vi.fn(actual.traceException),
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
      start_time: toClickhouseDateTime(row.startTime),
      event_ts: toClickhouseDateTime(),
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

function getLastGaugeValue(stat: string): number {
  return (
    integrationHooks.gaugeCalls.findLast(([name]) => name === stat)?.[1] ??
    Number.NaN
  );
}

describe("BatchDataRetentionCleaner", () => {
  beforeEach(() => {
    // Retention only runs under an enterprise license. Pin that here rather
    // than inheriting it from the ambient env, so the suite does not depend on
    // which .env example the run happens to have loaded.
    vi.mocked(isEnterpriseLicenseAvailable).mockReturnValue(true);
  });

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

    it("should NOT delete traces when no enterprise license is available", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Simulate a self-hosted deployment whose license key was removed.
      vi.mocked(isEnterpriseLicenseAvailable).mockReturnValue(false);
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Retention is an enterprise entitlement, so the stored policy must stop
      // being applied once the instance can no longer configure it.
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
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

  describe("candidate discovery and enrichment", () => {
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
      integrationHooks.failExactEnrichmentOnReadOnly = true;
      integrationHooks.omitExactEnrichmentForProjectId = null;
      integrationHooks.failCandidateStreamAfterFirstRow = false;
      integrationHooks.activeCandidateStreams = 0;
      integrationHooks.candidateHttpTimeouts = [];
      integrationHooks.candidateQueries = [];
      integrationHooks.deleteQueries = [];
      integrationHooks.exactEnrichmentRequests = [];
      integrationHooks.gaugeCalls = [];
      integrationHooks.incrementCalls = [];
      vi.mocked(traceException).mockClear();
      await createRetentionTestTable(tableName);
    });

    afterEach(async () => {
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = originalChunkSize;
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT =
        originalProjectLimit;
      delete timestampColumns[tableName];
      await commandClickhouse({ query: `DROP TABLE IF EXISTS ${tableName}` });
    });

    it("resets gauges when it does not acquire the lock", async () => {
      const cleaner = new BatchDataRetentionCleaner(table);
      (
        cleaner as unknown as {
          lock: { acquire: () => Promise<"held_by_other"> };
        }
      ).lock.acquire = async () => "held_by_other";

      await cleaner.processBatch();

      expect(integrationHooks.gaugeCalls).toEqual([
        ["langfuse.batch_data_retention_cleaner.pending_projects", 0],
        ["langfuse.batch_data_retention_cleaner.seconds_past_cutoff", 0],
      ]);
    });

    it("discovers separate cutoffs while preserving deletion boundaries", async () => {
      const cutoff = new Date("2026-01-15T12:34:56.123Z");
      const projectIds = [
        "project-'quoted\\id",
        "same-cutoff",
        "next-millisecond",
      ];
      const projects = projectIds.map((projectId, index) => ({
        projectId,
        retentionDays: 7,
        cutoffDate: new Date(cutoff.getTime() + (index === 2 ? 1 : 0)),
      }));
      await insertRetentionTestRows(tableName, [
        { projectId: projectIds[0]!, startTime: cutoff.getTime() - 1 },
        { projectId: projectIds[0]!, startTime: cutoff.getTime() },
        { projectId: projectIds[0]!, startTime: cutoff.getTime() + 1 },
        { projectId: projectIds[1]!, startTime: cutoff.getTime() },
        { projectId: projectIds[2]!, startTime: cutoff.getTime() },
        { projectId: projectIds[2]!, startTime: cutoff.getTime() + 1 },
        { projectId: "outside-chunk", startTime: cutoff.getTime() - 1 },
      ]);

      const cleaner = new BatchDataRetentionCleaner(table) as unknown as {
        lock: { extend: () => Promise<boolean> };
        findExpiredProjectCandidates: (
          timestampColumn: string,
          chunk: { projects: typeof projects; cutoff: string },
        ) => Promise<{ candidates: typeof projects; complete: boolean }>;
        executeBatchDelete: (
          timestampColumn: string,
          workloads: Array<
            (typeof projects)[number] & {
              rowCount: null;
              secondsPastCutoff: null;
            }
          >,
        ) => Promise<void>;
      };
      cleaner.lock.extend = async () => true;
      const results = [];
      for (const chunk of [
        {
          projects: projects.slice(0, 2),
          cutoff: "2026-01-15 12:34:56.123",
        },
        {
          projects: projects.slice(2),
          cutoff: "2026-01-15 12:34:56.124",
        },
      ]) {
        results.push(
          await cleaner.findExpiredProjectCandidates("start_time", chunk),
        );
      }
      const candidates = results.flatMap((result) => result.candidates);

      expect(results.every((result) => result.complete)).toBe(true);
      expect(candidates.map((project) => project.projectId).sort()).toEqual(
        [projectIds[0], projectIds[2]].sort(),
      );
      expect(
        integrationHooks.candidateQueries.map(({ params }) => params),
      ).toEqual([
        {
          discoveryProjectIds: [projectIds[0], projectIds[1]],
          discoveryCutoff: "2026-01-15 12:34:56.123",
          candidateLimit: 2,
        },
        {
          discoveryProjectIds: [projectIds[2]],
          discoveryCutoff: "2026-01-15 12:34:56.124",
          candidateLimit: 1,
        },
      ]);
      for (const { query } of integrationHooks.candidateQueries) {
        expect(query.match(/project_id IN/g)).toHaveLength(1);
        expect(query).not.toContain(projectIds[0]);
      }

      await cleaner.executeBatchDelete(
        "start_time",
        candidates.map((candidate) => ({
          ...candidate,
          rowCount: null,
          secondsPastCutoff: null,
        })),
      );
      const deletion = integrationHooks.deleteQueries[0]!;
      expect(deletion.query).not.toContain("project_id IN");
      expect(deletion.query.match(/project_id =/g)).toHaveLength(2);
      const remainingRows = await queryClickhouse<{
        project_id: string;
        timestamp: string;
      }>({
        query: `
          SELECT project_id, toUnixTimestamp64Milli(start_time) AS timestamp
          FROM ${tableName}
          ORDER BY project_id, start_time
        `,
      });
      expect(
        remainingRows.map((row) => [row.project_id, Number(row.timestamp)]),
      ).toEqual([
        [projectIds[2], cutoff.getTime() + 1],
        ["outside-chunk", cutoff.getTime() - 1],
        [projectIds[0], cutoff.getTime()],
        [projectIds[0], cutoff.getTime() + 1],
        [projectIds[1], cutoff.getTime()],
      ]);
    });

    it("batches the full project list by cutoff without losing projects at chunk boundaries", async () => {
      const projectIds = await createProjectsWithRetention(5);
      await prisma.project.updateMany({
        where: { id: { in: [projectIds[1]!, projectIds[3]!] } },
        data: { retentionDays: 30 },
      });
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds } },
      });
      projects.sort(
        (left, right) =>
          projectIds.indexOf(left.id) - projectIds.indexOf(right.id),
      );
      const findProjects = vi
        .spyOn(prisma.project, "findMany")
        .mockResolvedValueOnce(projects);
      const now = new Date("2026-10-21T12:34:56.123Z");
      const cutoffs = projects.map(
        (project) => now.getTime() - project.retentionDays! * 86_400_000,
      );
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);

      try {
        await insertRetentionTestRows(
          tableName,
          projectIds.flatMap((projectId, index) => [
            { projectId, startTime: cutoffs[index]! - 1 },
            { projectId, startTime: cutoffs[index]! },
          ]),
        );
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = 2;

        await new BatchDataRetentionCleaner(table).processBatch();

        expect(
          integrationHooks.candidateQueries.map(
            ({ params }) => params?.discoveryProjectIds,
          ),
        ).toEqual([
          [projectIds[0], projectIds[2]],
          [projectIds[4]],
          [projectIds[1], projectIds[3]],
        ]);
        for (const { query, params } of integrationHooks.candidateQueries) {
          expect(query.match(/project_id IN/g)).toHaveLength(1);
          const ids = params!.discoveryProjectIds as string[];
          expect(params!.candidateLimit).toBe(ids.length);
          expect(params!.discoveryCutoff).toBe(
            toClickhouseDateTime(cutoffs[projectIds.indexOf(ids[0]!)]!),
          );
        }
        const remaining = await queryClickhouse<{
          project_id: string;
          timestamp: string;
        }>({
          query: `SELECT project_id, toUnixTimestamp64Milli(start_time) AS timestamp FROM ${tableName}`,
        });
        expect(
          remaining
            .map((row) => [row.project_id, Number(row.timestamp)])
            .sort(),
        ).toEqual(
          projectIds
            .map((projectId, index) => [projectId, cutoffs[index]])
            .sort(),
        );
      } finally {
        findProjects.mockRestore();
        vi.useRealTimers();
      }
    });

    it("prioritizes lag, breaks ties by total rows, and reports maximum lag", async () => {
      const [
        smallerTieProjectId,
        largerTieProjectId,
        olderButLessLateProjectId,
      ] = await createProjectsWithRetention(3);
      await prisma.project.update({
        where: { id: olderButLessLateProjectId! },
        data: { retentionDays: 59 },
      });

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const rowsAtDaysAgo = (projectId: string, daysAgo: number[]) =>
        daysAgo.map((days) => ({
          projectId,
          startTime: now - days * dayMs,
        }));
      await insertRetentionTestRows(
        tableName,
        rowsAtDaysAgo(smallerTieProjectId!, [10, 9]).concat(
          rowsAtDaysAgo(largerTieProjectId!, [10, 2, 1]),
          rowsAtDaysAgo(olderButLessLateProjectId!, [60]),
        ),
      );
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = 2;
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT = 1;

      await new BatchDataRetentionCleaner(table).processBatch();

      expect(
        await Promise.all(
          [
            smallerTieProjectId!,
            largerTieProjectId!,
            olderButLessLateProjectId!,
          ].map((projectId) =>
            getRetentionTestProjectCount(tableName, projectId),
          ),
        ),
      ).toEqual([2, 2, 1]);
      const expectedTimeoutSeconds = Math.ceil(
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS /
          1000,
      );
      expect(integrationHooks.candidateHttpTimeouts[0]).toEqual({
        send: expectedTimeoutSeconds,
        receive: expectedTimeoutSeconds,
      });
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.pending_projects",
        ),
      ).toBe(2);

      const lagValue = getLastGaugeValue(
        "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
      );
      expect(lagValue).toBeGreaterThan(2 * (dayMs / 1000));
      expect(lagValue).toBeLessThan(4 * (dayMs / 1000));
      expect(integrationHooks.gaugeCalls).toHaveLength(2);
    });

    it("reports the backlog remaining after a successful batch", async () => {
      const [mostLateProjectId, nextLateProjectId] =
        await createProjectsWithRetention(2);
      const dayMs = 24 * 60 * 60 * 1000;
      await insertRetentionTestRows(tableName, [
        {
          projectId: mostLateProjectId!,
          startTime: Date.now() - 12 * dayMs,
        },
        {
          projectId: nextLateProjectId!,
          startTime: Date.now() - 10 * dayMs,
        },
      ]);
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT = 1;

      await new BatchDataRetentionCleaner(table).processBatch();

      expect(
        await getRetentionTestProjectCount(tableName, mostLateProjectId!),
      ).toBe(0);
      expect(
        await getRetentionTestProjectCount(tableName, nextLateProjectId!),
      ).toBe(1);
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.pending_projects",
        ),
      ).toBe(1);

      const lagValue = getLastGaugeValue(
        "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
      );
      expect(lagValue).toBeGreaterThan(2 * (dayMs / 1000));
      expect(lagValue).toBeLessThan(4 * (dayMs / 1000));
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
        if (isCandidateStreamActive) {
          extendedDuringCandidateStream = true;
        }
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
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.pending_projects",
        ),
      ).toBe(1);
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
        ),
      ).toBeGreaterThan(2 * 24 * 60 * 60);
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
      expect(integrationHooks.gaugeCalls).toEqual([]);
    });

    it("continues other chunks after one enrichment exhausts its retry", async () => {
      const [failedProjectId, successfulProjectId] =
        await createProjectsWithRetention(2);
      await insertRetentionTestRows(
        tableName,
        [failedProjectId!, successfulProjectId!].map((projectId) => ({
          projectId,
          startTime: new Date("2020-01-15T00:00:00.000Z").getTime(),
        })),
      );
      integrationHooks.failExactEnrichmentForProjectId = failedProjectId!;
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE = 1;

      await new BatchDataRetentionCleaner(table).processBatch();

      expect(await getRetentionTestRowCount(tableName)).toBe(0);
      const failedProjectRequests =
        integrationHooks.exactEnrichmentRequests.filter((request) =>
          request.projectIds.includes(failedProjectId!),
        );
      expect(
        failedProjectRequests.map(
          (request) => request.preferredClickhouseService,
        ),
      ).toEqual([undefined, "ReadOnly"]);
      expect(
        integrationHooks.exactEnrichmentRequests.filter((request) =>
          request.projectIds.includes(successfulProjectId!),
        ),
      ).toHaveLength(1);
      expect(
        integrationHooks.exactEnrichmentRequests.every(
          (request) =>
            request.requestTimeout ===
            env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS,
        ),
      ).toBe(true);
      expect(
        integrationHooks.incrementCalls.filter(
          ([name]) =>
            name ===
            "langfuse.batch_data_retention_cleaner.enrichment_query_failures",
        ),
      ).toHaveLength(1);
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.pending_projects",
        ),
      ).toBe(0);
      expect(
        integrationHooks.gaugeCalls.some(
          ([name]) =>
            name ===
            "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
        ),
      ).toBe(false);
    });

    it("traces recovered enrichment without failing the runner outcome", async () => {
      const [projectId] = await createProjectsWithRetention(1);
      await insertRetentionTestRows(tableName, [
        {
          projectId: projectId!,
          startTime: Date.now() - 10 * 24 * 60 * 60 * 1000,
        },
      ]);
      integrationHooks.failExactEnrichmentForProjectId = projectId!;
      integrationHooks.failExactEnrichmentOnReadOnly = false;

      const cleaner = new BatchDataRetentionCleaner(table);
      const markRunFailed = vi.spyOn(
        cleaner as unknown as {
          markRunFailed(error: unknown): void;
        },
        "markRunFailed",
      );

      await cleaner.processBatch();

      expect(
        integrationHooks.exactEnrichmentRequests.map(
          (request) => request.preferredClickhouseService,
        ),
      ).toEqual([undefined, "ReadOnly"]);
      expect(await getRetentionTestRowCount(tableName)).toBe(0);
      expect(traceException).toHaveBeenCalledTimes(1);
      expect(markRunFailed).not.toHaveBeenCalled();
    });

    it("keeps sibling enrichment when a candidate disappears", async () => {
      const [staleProjectId, siblingProjectId] =
        await createProjectsWithRetention(2);
      const dayMs = 24 * 60 * 60 * 1000;
      await insertRetentionTestRows(
        tableName,
        [staleProjectId!, siblingProjectId!].map((projectId) => ({
          projectId,
          startTime: Date.now() - 10 * dayMs,
        })),
      );
      integrationHooks.omitExactEnrichmentForProjectId = staleProjectId!;

      await new BatchDataRetentionCleaner(table).processBatch();

      expect(
        await getRetentionTestProjectCount(tableName, siblingProjectId!),
      ).toBe(0);
      expect(
        integrationHooks.incrementCalls.some(
          ([name]) =>
            name ===
            "langfuse.batch_data_retention_cleaner.enrichment_query_failures",
        ),
      ).toBe(false);
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.pending_projects",
        ),
      ).toBe(0);
      expect(
        getLastGaugeValue(
          "langfuse.batch_data_retention_cleaner.seconds_past_cutoff",
        ),
      ).toBe(0);
    });
  });
});
