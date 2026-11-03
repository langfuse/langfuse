import {
  expect,
  it,
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { env } from "../env";
import { randomUUID } from "crypto";
import {
  clickhouseClient,
  createObservation,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  getBlobStorageByProjectAndEntityId,
  getObservationById,
  getScoreById,
  getTraceById,
  StorageService,
  StorageServiceFactory,
  toClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { prisma, Prisma, PrismaClient } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { isEnterpriseLicenseAvailable } from "@langfuse/shared/src/server/ee/licenseCheck";
import { handleDataRetentionProcessingJob } from "../ee/dataRetention/handleDataRetentionProcessingJob";
import { Job } from "bullmq";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import { InAppAgentRunStatus } from "@langfuse/shared/in-app-agent";
import { InAppAgentRetentionCleaner } from "../features/in-app-agent-retention-cleaner";

type LicenseCheckModule =
  typeof import("@langfuse/shared/src/server/ee/licenseCheck");

// Overriding the shared env object is not observed by the license check at
// runtime here, so cases cannot simulate a deployment that way. Wrap the real
// implementation instead: it keeps the actual key-prefix rules under test
// while letting a case choose the environment they are evaluated against.
vi.mock(
  "@langfuse/shared/src/server/ee/licenseCheck",
  async (importOriginal) => {
    const actual = await importOriginal<LicenseCheckModule>();
    return {
      ...actual,
      isEnterpriseLicenseAvailable: vi.fn(actual.isEnterpriseLicenseAvailable),
    };
  },
);

const { isEnterpriseLicenseAvailable: actualIsEnterpriseLicenseAvailable } =
  await vi.importActual<LicenseCheckModule>(
    "@langfuse/shared/src/server/ee/licenseCheck",
  );

describe("DataRetentionProcessingJob", () => {
  let storageService: StorageService;
  let s3Prefix: string | null = null;
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeAll(() => {
    storageService = StorageServiceFactory.getInstance({
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  beforeEach(() => {
    s3Prefix = `${randomUUID()}/`;
    // Retention only runs under an enterprise license. Pin that here rather
    // than inheriting it from the ambient env, so the suite does not depend on
    // which .env example the run happens to have loaded.
    vi.mocked(isEnterpriseLicenseAvailable).mockReturnValue(true);
  });

  afterEach(async () => {
    // Clean up all files created during this test
    if (!s3Prefix) return;

    const files = await storageService.listFiles(s3Prefix);

    if (files.length == 0) return;

    await storageService.deleteFiles(files.map((f) => f.file));
    s3Prefix = null;
  });

  it("deletes expired conversations and their runs and events, but keeps recent and active conversations", async () => {
    const expiredAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentAt = new Date();
    const expiredId = randomUUID();
    const recentId = randomUUID();
    const runningId = randomUUID();
    const staleId = randomUUID();
    const eventlessId = randomUUID();
    const legacyId = randomUUID();
    const recentLegacyId = randomUUID();
    const keyIds: string[] = [];
    const ids = [
      expiredId,
      recentId,
      runningId,
      staleId,
      eventlessId,
      legacyId,
      recentLegacyId,
    ];

    const { id: projectId, orgId } = await prisma.project.create({
      data: {
        name: "Assistant retention test",
        retentionDays: 7,
        organization: { create: { name: "Assistant retention test" } },
      },
    });

    const queryRaw = prisma.$queryRaw.bind(prisma);
    const candidateQuery = vi.spyOn(prisma, "$queryRaw");
    try {
      const creator = await prisma.user.create({
        data: {
          email: `retention-${randomUUID()}@langfuse.com`,
          name: "retention-user",
        },
      });
      const key = await createApiKey(prisma, {
        tenant: OrganizationId(orgId),
        scope: ProjectId(projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId(creator.id),
        isInAppAgentKey: true,
      });
      keyIds.push(key.id);
      await prisma.inAppAgentConversation.createMany({
        data: [
          {
            id: expiredId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          {
            id: recentId,
            projectId,
            createdAt: expiredAt,
            updatedAt: recentAt,
          },
          {
            id: runningId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          {
            id: staleId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          {
            id: eventlessId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          {
            id: legacyId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
          {
            id: recentLegacyId,
            projectId,
            createdAt: expiredAt,
            updatedAt: expiredAt,
          },
        ],
      });
      const expiredRunIds = Array.from({ length: 101 }, () => randomUUID());
      const runningRunId = randomUUID();
      await prisma.inAppAgentRun.createMany({
        data: [
          ...expiredRunIds.map((id) => ({
            id,
            projectId,
            conversationId: expiredId,
            createdAt: expiredAt,
            finishedAt: expiredAt,
            mcpApiKeyId: key.id,
          })),
          { id: runningRunId, projectId, conversationId: runningId },
          {
            id: randomUUID(),
            projectId,
            conversationId: staleId,
            status: InAppAgentRunStatus.RUNNING,
            createdAt: expiredAt,
            claimedAt: expiredAt,
            heartbeatAt: expiredAt,
          },
          {
            id: randomUUID(),
            projectId,
            conversationId: legacyId,
            status: null,
            createdAt: expiredAt,
            request: { message: "old request" },
          },
          {
            id: randomUUID(),
            projectId,
            conversationId: recentLegacyId,
            status: null,
            createdAt: recentAt,
          },
        ],
      });
      await prisma.inAppAgentEvent.createMany({
        data: [
          {
            projectId,
            conversationId: expiredId,
            runId: expiredRunIds[0],
            sequenceNumber: 0,
            type: "test",
            event: {},
            createdAt: recentAt,
          },
          {
            projectId,
            conversationId: runningId,
            runId: runningRunId,
            sequenceNumber: 0,
            type: "test",
            event: {},
            createdAt: expiredAt,
          },
        ],
      });

      // API-key fixture setup also queries projects while assigning its role.
      candidateQuery.mockClear();
      candidateQuery.mockImplementation((query, ...values) =>
        queryRaw(Prisma.sql`
          WITH in_app_agent_conversations AS (
            SELECT * FROM public.in_app_agent_conversations
            WHERE project_id = ${projectId}
          )
          ${"sql" in query ? query : Prisma.sql(query, ...values)}
        `),
      );
      const cleaner = new InAppAgentRetentionCleaner();
      // A conversation with 101 keys remains eligible until its last key is cleaned.
      expect(await cleaner.processBatch()).toBe(0);
      expect(
        await prisma.inAppAgentRun.count({
          where: {
            projectId,
            conversationId: expiredId,
            mcpApiKeyId: { not: null },
          },
        }),
      ).toBe(1);
      expect(await cleaner.processBatch()).toBe(0);
      expect(await cleaner.processBatch()).toBe(600_000);
      const [backlog] = await candidateQuery.mock.results[3]!.value;
      // Thirty-day-old conversations with seven-day retention are 23 days overdue.
      expect(backlog.overdueSeconds).toBeGreaterThanOrEqual(23 * 24 * 60 * 60);
      expect(backlog.overdueSeconds).toBeLessThan(
        (Date.now() - expiredAt.getTime()) / 1000 - 7 * 24 * 60 * 60 + 1,
      );
      const discovered = (
        await Promise.all(candidateQuery.mock.results.map(({ value }) => value))
      )
        .flat()
        .filter((row) => "projectId" in row);
      expect(discovered).toHaveLength(3);
      expect(discovered).toEqual(
        expect.arrayContaining([
          { id: expiredId, projectId },
          { id: eventlessId, projectId },
        ]),
      );

      const conversations = await prisma.inAppAgentConversation.findMany({
        where: { projectId, id: { in: ids } },
        select: { id: true },
      });
      expect(conversations.map(({ id }) => id).sort()).toEqual(
        [recentId, runningId, staleId, legacyId, recentLegacyId].sort(),
      );
      expect(
        await prisma.inAppAgentRun.count({
          where: { projectId, conversationId: expiredId },
        }),
      ).toBe(0);
      expect(
        await prisma.inAppAgentEvent.count({
          where: { projectId, conversationId: expiredId },
        }),
      ).toBe(0);
      expect(
        await prisma.inAppAgentEvent.count({
          where: { projectId, conversationId: runningId },
        }),
      ).toBe(1);
      expect(await prisma.apiKey.count({ where: { id: key.id } })).toBe(0);
      expect(
        await prisma.inAppAgentRun.count({
          where: { projectId, conversationId: legacyId },
        }),
      ).toBe(1);
      expect(
        await prisma.inAppAgentRun.count({
          where: { projectId, conversationId: staleId },
        }),
      ).toBe(1);
    } finally {
      candidateQuery.mockRestore();
      await prisma.inAppAgentConversation.deleteMany({
        where: { projectId, id: { in: ids } },
      });
      await prisma.apiKey.deleteMany({ where: { id: { in: keyIds } } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
  });

  it.each([
    { retentionDays: null, deletedAt: null },
    { retentionDays: 0, deletedAt: null },
    { retentionDays: 7, deletedAt: new Date() },
  ])(
    "does not discover assistant conversations with policy %j",
    async ({ retentionDays, deletedAt }) => {
      const id = randomUUID();
      const { id: projectId, orgId } = await prisma.project.create({
        data: {
          name: "Assistant retention policy test",
          retentionDays,
          deletedAt,
          organization: { create: { name: "Assistant retention policy test" } },
        },
      });
      const queryRaw = prisma.$queryRaw.bind(prisma);
      const candidateQuery = vi.spyOn(prisma, "$queryRaw");
      candidateQuery.mockImplementation((query, ...values) =>
        queryRaw(Prisma.sql`
          WITH in_app_agent_conversations AS (
            SELECT * FROM public.in_app_agent_conversations
            WHERE project_id = ${projectId}
          )
          ${"sql" in query ? query : Prisma.sql(query, ...values)}
        `),
      );
      try {
        const expiredAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await prisma.inAppAgentConversation.create({
          data: { id, projectId, createdAt: expiredAt, updatedAt: expiredAt },
        });
        expect(await new InAppAgentRetentionCleaner().processBatch()).toBe(
          600_000,
        );
        expect(await candidateQuery.mock.results[0]!.value).toEqual([]);
        expect(
          await prisma.inAppAgentConversation.count({
            where: { id, projectId },
          }),
        ).toBe(1);
      } finally {
        candidateQuery.mockRestore();
        await prisma.inAppAgentConversation.deleteMany({
          where: { id, projectId },
        });
        await prisma.organization.delete({ where: { id: orgId } });
      }
    },
  );

  it.each(["Asia/Tokyo", "America/Los_Angeles"])(
    "uses UTC retention boundaries in the %s session timezone",
    async (timezone) => {
      const { id: projectId, orgId } = await prisma.project.create({
        data: {
          name: "Assistant retention timezone test",
          retentionDays: 7,
          organization: {
            create: { name: "Assistant retention timezone test" },
          },
        },
      });
      const expiredId = randomUUID();
      const retainedId = randomUUID();
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const hour = 60 * 60 * 1000;
      const timezonePrisma = new PrismaClient();
      const candidateQuery = vi.spyOn(prisma, "$queryRaw");
      const deletionQuery = vi.spyOn(prisma, "$executeRaw");

      try {
        await prisma.inAppAgentConversation.createMany({
          data: [
            { id: expiredId, projectId, updatedAt: new Date(cutoff - hour) },
            { id: retainedId, projectId, updatedAt: new Date(cutoff + hour) },
          ],
        });
        // SET LOCAL stays on the transaction's connection and cannot leak
        // timezone changes to other tests using the pool.
        candidateQuery.mockImplementation((query, ...values) =>
          timezonePrisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
            return tx.$queryRaw(Prisma.sql`
              WITH in_app_agent_conversations AS (
                SELECT * FROM public.in_app_agent_conversations
                WHERE project_id = ${projectId}
              )
              ${"sql" in query ? query : Prisma.sql(query, ...values)}
            `);
          }),
        );
        deletionQuery.mockImplementation((query, ...values) =>
          timezonePrisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
            return tx.$executeRaw(query, ...values);
          }),
        );

        await new InAppAgentRetentionCleaner().processBatch();
        expect(await candidateQuery.mock.results[0]!.value).toEqual([
          { id: expiredId, projectId },
        ]);
        expect(
          await prisma.inAppAgentConversation.findMany({
            where: { projectId },
            select: { id: true },
          }),
        ).toEqual([{ id: retainedId }]);

        // Independently exercise the live deletion guard with a candidate
        // whose timestamp no longer qualifies for retention.
        candidateQuery.mockResolvedValue([{ id: retainedId, projectId }]);
        await new InAppAgentRetentionCleaner().processBatch();
        expect(
          await prisma.inAppAgentConversation.count({ where: { projectId } }),
        ).toBe(1);
      } finally {
        candidateQuery.mockRestore();
        deletionQuery.mockRestore();
        await timezonePrisma.$disconnect();
        await prisma.organization.delete({ where: { id: orgId } });
      }
    },
  );

  it.each([null, 0])(
    "retains assistant conversations when retention changes to %s after discovery",
    async (retentionDays) => {
      const id = randomUUID();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays },
      });

      const candidateQuery = vi.spyOn(prisma, "$queryRaw");
      try {
        await prisma.inAppAgentConversation.create({
          data: {
            id,
            projectId,
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        });

        // Simulate a policy change after discovery without sweeping other fixtures.
        candidateQuery.mockResolvedValue([{ id, projectId }]);
        await new InAppAgentRetentionCleaner().processBatch();

        expect(
          await prisma.inAppAgentConversation.findUnique({
            where: { id_projectId: { id, projectId } },
          }),
        ).not.toBeNull();
      } finally {
        candidateQuery.mockRestore();
        await prisma.inAppAgentConversation.deleteMany({
          where: { id, projectId },
        });
      }
    },
  );

  it("should NOT delete event files from cloud storage if after expiry cutoff", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    const fileName = `${s3Prefix}${baseId}.json`;
    const fileType = "application/json";
    const data = JSON.stringify({ hello: "world" });

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: `${baseId}-trace`,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: fileName,
          created_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 3,
          ), // 3 days in the past
          updated_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 3,
          ), // 3 days in the past
        },
      ],
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).toContain(fileName);

    const eventLogRecord = await getBlobStorageByProjectAndEntityId(
      projectId,
      "trace",
      `${baseId}-trace`,
    );
    expect(eventLogRecord).toHaveLength(1);

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete event files from cloud storage if expired", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    const fileName = `${s3Prefix}${baseId}.json`;
    const fileType = "application/json";
    const data = JSON.stringify({ hello: "world" });

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    await clickhouseClient().insert({
      table: "blob_storage_file_log",
      format: "JSONEachRow",
      values: [
        {
          id: randomUUID(),
          project_id: projectId,
          entity_type: "trace",
          entity_id: `${baseId}-trace`,
          event_id: randomUUID(),
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: fileName,
          created_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 30,
          ), // 30 days in the past
          updated_at: toClickhouseDateTime(
            Date.now() - 1000 * 60 * 60 * 24 * 30,
          ), // 30 days in the past
        },
      ],
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).not.toContain(fileName);

    const eventLogRecord = await getBlobStorageByProjectAndEntityId(
      projectId,
      "trace",
      `${baseId}-trace`,
    );
    expect(eventLogRecord).toHaveLength(0);

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should NOT delete media files from cloud storage and database if after expiry cutoff", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    const mediaId = randomUUID();
    const traceId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days in the past
        bucketPath: fileName,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });

    await prisma.traceMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        traceId,
        mediaId,
        field: "test",
      },
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).toContain(fileName);

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media).toBeDefined();

    const traceMedia = await prisma.traceMedia.findFirst({
      where: { mediaId },
    });
    expect(traceMedia).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete media files from cloud storage and database if expired", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const fileName = `${s3Prefix}${randomUUID()}.txt`;
    const fileType = "text/plain";
    const data = "Hello, world!";

    await storageService.uploadFile({
      fileName,
      fileType,
      data,
    });

    const mediaId = randomUUID();
    const traceId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        sha256Hash: randomUUID(),
        projectId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30 days in the past
        bucketPath: fileName,
        bucketName: String(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET),
        contentType: fileType,
        contentLength: 0,
      },
    });

    await prisma.traceMedia.create({
      data: {
        id: randomUUID(),
        projectId,
        traceId,
        mediaId,
        field: "test",
      },
    });

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const files = await storageService.listFiles(s3Prefix);
    expect(files.map((file) => file.file)).not.toContain(fileName);

    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(media).toBeNull();

    const traceMedia = await prisma.traceMedia.findFirst({
      where: { mediaId },
    });
    expect(traceMedia).toBeNull();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete traces older than retention days", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createTrace({
        id: `${baseId}-trace-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeUndefined();
    const traceNew = await getTraceById({
      traceId: `${baseId}-trace-new`,
      projectId,
    });
    expect(traceNew).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete observations older than retention days", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createObservationsCh([
      createObservation({
        id: `${baseId}-observation-old`,
        project_id: projectId,
        start_time: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createObservation({
        id: `${baseId}-observation-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    expect(() =>
      getObservationById({ id: `${baseId}-observation-old`, projectId }),
    ).rejects.toThrowError("not found");
    const observationNew = await getObservationById({
      id: `${baseId}-observation-new`,
      projectId,
    });
    expect(observationNew).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should delete scores older than retention days", async () => {
    // Setup: Set retention in database to match job payload
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 7 },
    });

    const baseId = randomUUID();
    await createScoresCh([
      createTraceScore({
        id: `${baseId}-score-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
      createTraceScore({
        id: `${baseId}-score-new`,
        project_id: projectId,
      }),
    ]);

    // When
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Delete after 7 days
    } as Job);

    // Then
    const scoresOld = await getScoreById({
      projectId,
      scoreId: `${baseId}-score-old`,
    });
    expect(scoresOld).toBeUndefined();
    const scoresNew = await getScoreById({
      projectId,
      scoreId: `${baseId}-score-new`,
    });
    expect(scoresNew).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should skip deletion when retention is changed to 0 (indefinite) after job was queued", async () => {
    // Setup: Create data that would be deleted if retention was still 7 days
    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
    ]);

    // Simulate that project retention was changed to 0 (indefinite)
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 0 },
    });

    // When: Process job that was queued with retention: 7
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Job queued with 7 day retention
    } as Job);

    // Then: Data should NOT be deleted because current retention is 0
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  it("should skip deletion when retention is changed to null after job was queued", async () => {
    // Setup: Create data that would be deleted if retention was still 7 days
    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-old-2`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
      }),
    ]);

    // Simulate that project retention was removed (null)
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });

    // When: Process job that was queued with retention: 7
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Job queued with 7 day retention
    } as Job);

    // Then: Data should NOT be deleted because current retention is null
    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old-2`,
      projectId,
    });
    expect(traceOld).toBeDefined();
  });

  it("should use current retention value if it changed from queued value", async () => {
    // Setup: Create data with different ages
    const baseId = randomUUID();
    await createTracesCh([
      createTrace({
        id: `${baseId}-trace-very-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).getTime(), // 40 days in the past
      }),
      createTrace({
        id: `${baseId}-trace-old`,
        project_id: projectId,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).getTime(), // 25 days in the past
      }),
    ]);

    // Simulate that project retention was changed from 7 to 30 days
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 30 },
    });

    // When: Process job that was queued with retention: 7
    await handleDataRetentionProcessingJob({
      data: { payload: { projectId, retention: 7 } }, // Job queued with 7 day retention
    } as Job);

    // Then: Should use current retention (30 days)
    // - Trace at 40 days should be deleted
    // - Trace at 25 days should remain
    const traceVeryOld = await getTraceById({
      traceId: `${baseId}-trace-very-old`,
      projectId,
    });
    expect(traceVeryOld).toBeUndefined();

    const traceOld = await getTraceById({
      traceId: `${baseId}-trace-old`,
      projectId,
    });
    expect(traceOld).toBeDefined();

    // Cleanup
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: null },
    });
  });

  describe("enterprise license enforcement", () => {
    /**
     * Point the license check at a simulated self-hosted deployment holding
     * the given license key. The real implementation is kept, so these cases
     * still exercise the actual key-prefix rules; only the environment it
     * reads is substituted. The cloud region has to be cleared too, because
     * any cloud region counts as licensed.
     */
    const withSelfHostedLicense = async (
      licenseKey: string | undefined,
      fn: () => Promise<void>,
    ) => {
      vi.mocked(isEnterpriseLicenseAvailable).mockImplementation(() =>
        actualIsEnterpriseLicenseAvailable({
          ...sharedEnv,
          NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
          LANGFUSE_EE_LICENSE_KEY: licenseKey,
        }),
      );
      try {
        await fn();
      } finally {
        vi.mocked(isEnterpriseLicenseAvailable).mockReturnValue(true);
      }
    };

    const seedExpiredTrace = async (traceId: string) => {
      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).getTime(), // 30 days in the past
        }),
      ]);
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });
    };

    afterEach(async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: null },
      });
    });

    it("should not delete expired data when the self-hosted license key is removed", async () => {
      const traceId = `${randomUUID()}-trace-unlicensed`;
      await seedExpiredTrace(traceId);

      await withSelfHostedLicense(undefined, async () => {
        await handleDataRetentionProcessingJob({
          data: { payload: { projectId, retention: 7 } },
        } as Job);
      });

      // Retention is an enterprise entitlement, so a stored policy must stop
      // being applied once the instance can no longer configure it.
      const trace = await getTraceById({ traceId, projectId });
      expect(trace).toBeDefined();
    });

    it("should not delete expired data on a self-hosted pro license", async () => {
      const traceId = `${randomUUID()}-trace-pro`;
      await seedExpiredTrace(traceId);

      await withSelfHostedLicense("langfuse_pro_some-key", async () => {
        await handleDataRetentionProcessingJob({
          data: { payload: { projectId, retention: 7 } },
        } as Job);
      });

      // Pro does not carry the data-retention entitlement.
      const trace = await getTraceById({ traceId, projectId });
      expect(trace).toBeDefined();
    });

    it.each([
      ["enterprise", "langfuse_ee_some-key"],
      ["government", "lf_gov_some-key"],
    ])(
      "should delete expired data on a self-hosted %s license",
      async (label, licenseKey) => {
        const traceId = `${randomUUID()}-trace-${label}`;
        await seedExpiredTrace(traceId);

        await withSelfHostedLicense(licenseKey, async () => {
          await handleDataRetentionProcessingJob({
            data: { payload: { projectId, retention: 7 } },
          } as Job);
        });

        // Pins that the guard is the license and not an unrelated skip.
        const trace = await getTraceById({ traceId, projectId });
        expect(trace).toBeUndefined();
      },
    );
  });
});
