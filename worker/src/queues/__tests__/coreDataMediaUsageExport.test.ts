import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { DelayedError, type Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import {
  createOrgProjectAndApiKey,
  redis,
  type StorageService,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  computeMediaUsageExportDays,
  exportMediaUsageHourly,
  formatUtcDay,
  mediaUsageDayObjectKey,
  mediaUsageWatermarkKey,
  readMediaUsageWatermark,
} from "../coreDataMediaUsageExport";
import { processMediaUsageExportJob } from "../coreDataS3ExportQueue";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const readStream = async (stream: Readable): Promise<string> => {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }
  return chunks.join("");
};

const createInMemoryStorage = () => {
  const objects = new Map<string, string>();
  const failNextUploadOf = new Set<string>();
  const onUploadOf = new Map<string, () => void>();
  const put = async ({
    fileName,
    data,
  }: {
    fileName: string;
    data: Readable | string;
  }) => {
    const body = typeof data === "string" ? data : await readStream(data);
    if (failNextUploadOf.delete(fileName)) {
      throw new Error(`Injected upload failure for ${fileName}`);
    }
    onUploadOf.get(fileName)?.();
    objects.set(fileName, body);
  };
  const s3Client = {
    listFiles: async (prefix: string) =>
      [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((file) => ({ file, createdAt: new Date() })),
    download: async (path: string) => {
      const body = objects.get(path);
      if (body === undefined) {
        throw new Error(`NoSuchKey ${path}`);
      }
      return body;
    },
    uploadFile: vi.fn(put),
    uploadFileBuffered: vi.fn(put),
  } as unknown as StorageService;

  return { objects, failNextUploadOf, onUploadOf, s3Client };
};

describe("computeMediaUsageExportDays", () => {
  it.each([
    {
      name: "first run backfills every closed day from the backfill start",
      now: "2026-03-04T03:15:00.000Z",
      exportedUntil: null,
      backfillStart: "2026-02-27T17:42:00.000Z",
      expected: [
        "2026-02-27",
        "2026-02-28",
        "2026-03-01",
        "2026-03-02",
        "2026-03-03",
      ],
    },
    {
      name: "steady state re-exports only the lookback window",
      now: "2026-03-10T03:15:00.000Z",
      exportedUntil: "2026-03-09",
      backfillStart: null,
      expected: ["2026-03-07", "2026-03-08", "2026-03-09"],
    },
    {
      name: "missed runs catch up from the watermark",
      now: "2026-03-10T03:15:00.000Z",
      exportedUntil: "2026-03-02",
      backfillStart: null,
      expected: [
        "2026-03-02",
        "2026-03-03",
        "2026-03-04",
        "2026-03-05",
        "2026-03-06",
        "2026-03-07",
        "2026-03-08",
        "2026-03-09",
      ],
    },
    {
      name: "the current UTC day stays open until midnight UTC",
      now: "2026-03-10T23:59:59.999Z",
      exportedUntil: "2026-03-10",
      backfillStart: null,
      expected: ["2026-03-07", "2026-03-08", "2026-03-09"],
    },
    {
      name: "a day closes exactly at midnight UTC",
      now: "2026-03-11T00:00:00.000Z",
      exportedUntil: "2026-03-10",
      backfillStart: null,
      expected: ["2026-03-08", "2026-03-09", "2026-03-10"],
    },
    {
      name: "nothing to export without a watermark or any project",
      now: "2026-03-10T03:15:00.000Z",
      exportedUntil: null,
      backfillStart: null,
      expected: [],
    },
  ])("$name", ({ now, exportedUntil, backfillStart, expected }) => {
    const days = computeMediaUsageExportDays({
      now: new Date(now),
      exportedUntil: exportedUntil ? day(exportedUntil) : null,
      backfillStart: backfillStart ? new Date(backfillStart) : null,
      lookbackDays: 3,
    });

    expect(days.map(formatUtcDay)).toEqual(expected);
  });
});

describe("exportMediaUsageHourly", () => {
  const hash = (seed: string) =>
    createHash("sha256").update(seed).digest("base64");

  const createProjects = async () => {
    const [{ projectId: projectA }, { projectId: projectB }] =
      await Promise.all([
        createOrgProjectAndApiKey(),
        createOrgProjectAndApiKey(),
      ]);
    // The export only visits projects that existed during the exported day.
    await prisma.project.updateMany({
      where: { id: { in: [projectA, projectB] } },
      data: { createdAt: day("2026-01-01") },
    });
    return { projectA, projectB };
  };

  const insertMedia = (
    rows: Array<{
      projectId: string;
      createdAt: string;
      contentType?: string;
      contentLength: number;
      uploadHttpStatus: number | null;
      secret: string;
    }>,
  ) =>
    prisma.media.createMany({
      data: rows.map((row) => {
        const id = randomUUID();
        return {
          id,
          projectId: row.projectId,
          sha256Hash: hash(id),
          bucketPath: `${row.secret}/${id}`,
          bucketName: row.secret,
          contentType: row.contentType ?? "image/png",
          contentLength: row.contentLength,
          createdAt: new Date(row.createdAt),
          uploadedAt:
            row.uploadHttpStatus === null ? null : new Date(row.createdAt),
          uploadHttpStatus: row.uploadHttpStatus,
          uploadHttpError: row.uploadHttpStatus === 500 ? row.secret : null,
        };
      }),
    });

  const rowsFor = (
    objects: Map<string, string>,
    dayValue: string,
    projectIds: string[],
  ) =>
    (objects.get(mediaUsageDayObjectKey("core/", day(dayValue))) ?? "")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((row) => projectIds.includes(row.projectId as string));

  it("exports closed UTC days by hour, rewrites the lookback window on rerun, and keeps reruns idempotent", async () => {
    const { projectA, projectB } = await createProjects();
    const secret = `do-not-export-${randomUUID()}`;
    const projects = [projectA, projectB];
    const { objects, s3Client } = createInMemoryStorage();
    objects.set(
      mediaUsageWatermarkKey("core/"),
      JSON.stringify({ exportedUntil: "2026-03-01T00:00:00.000Z" }),
    );

    try {
      await insertMedia([
        // Before the lookback window and at or before the watermark.
        {
          projectId: projectA,
          createdAt: "2026-02-26T23:59:59.999Z",
          contentLength: 1,
          uploadHttpStatus: 201,
          secret,
        },
        {
          projectId: projectA,
          createdAt: "2026-03-01T00:00:00.000Z",
          contentLength: 100,
          uploadHttpStatus: 201,
          secret,
        },
        {
          projectId: projectA,
          createdAt: "2026-03-01T00:59:59.999Z",
          contentLength: 250,
          uploadHttpStatus: 201,
          secret,
        },
        {
          projectId: projectA,
          createdAt: "2026-03-01T00:10:00.000Z",
          contentType: "image/jpeg",
          contentLength: 10,
          uploadHttpStatus: 201,
          secret,
        },
        {
          projectId: projectA,
          createdAt: "2026-03-01T23:59:59.999Z",
          contentLength: 40,
          uploadHttpStatus: null,
          secret,
        },
        {
          projectId: projectA,
          createdAt: "2026-03-02T05:00:00.000Z",
          contentLength: 5,
          uploadHttpStatus: 500,
          secret,
        },
        {
          projectId: projectB,
          createdAt: "2026-03-01T00:30:00.000Z",
          contentLength: 1000,
          uploadHttpStatus: 201,
          secret,
        },
        // Still an open day on the first run.
        {
          projectId: projectA,
          createdAt: "2026-03-03T00:00:00.000Z",
          contentLength: 7,
          uploadHttpStatus: 201,
          secret,
        },
      ]);

      await exportMediaUsageHourly({
        s3Client,
        uploadPrefix: "core/",
        now: new Date("2026-03-03T03:15:00.000Z"),
        projectBatchSize: 1,
      });

      expect(
        [...objects.keys()].filter((key) => key.endsWith(".jsonl")).sort(),
      ).toEqual(
        ["2026-02-28", "2026-03-01", "2026-03-02"].map((value) =>
          mediaUsageDayObjectKey("core/", day(value)),
        ),
      );
      expect(rowsFor(objects, "2026-02-28", projects)).toEqual([]);
      const march1 = rowsFor(objects, "2026-03-01", projects);
      const expectedMarch1 = [
        {
          projectId: projectA,
          hour: "2026-03-01T00:00:00.000Z",
          contentType: "image/jpeg",
          uploadHttpStatus: 201,
          mediaCount: 1,
          totalContentLength: 10,
        },
        {
          projectId: projectA,
          hour: "2026-03-01T00:00:00.000Z",
          contentType: "image/png",
          uploadHttpStatus: 201,
          mediaCount: 2,
          totalContentLength: 350,
        },
        {
          projectId: projectA,
          hour: "2026-03-01T23:00:00.000Z",
          contentType: "image/png",
          uploadHttpStatus: null,
          mediaCount: 1,
          totalContentLength: 40,
        },
        {
          projectId: projectB,
          hour: "2026-03-01T00:00:00.000Z",
          contentType: "image/png",
          uploadHttpStatus: 201,
          mediaCount: 1,
          totalContentLength: 1000,
        },
      ];
      expect(march1).toHaveLength(expectedMarch1.length);
      expect(march1).toEqual(expect.arrayContaining(expectedMarch1));
      expect(Object.keys(march1[0] ?? {})).toEqual([
        "projectId",
        "hour",
        "contentType",
        "uploadHttpStatus",
        "mediaCount",
        "totalContentLength",
      ]);
      expect(rowsFor(objects, "2026-03-02", projects)).toEqual([
        {
          projectId: projectA,
          hour: "2026-03-02T05:00:00.000Z",
          contentType: "image/png",
          uploadHttpStatus: 500,
          mediaCount: 1,
          totalContentLength: 5,
        },
      ]);
      expect([...objects.values()].join("\n")).not.toContain(secret);
      await expect(readMediaUsageWatermark(s3Client, "core/")).resolves.toEqual(
        day("2026-03-03"),
      );

      // The pending upload finishes after its day closed, and a row is
      // committed with a creation time in an already exported day.
      await prisma.media.updateMany({
        where: {
          projectId: projectA,
          createdAt: new Date("2026-03-01T23:59:59.999Z"),
        },
        data: { uploadHttpStatus: 201, uploadedAt: day("2026-03-03") },
      });
      await insertMedia([
        {
          projectId: projectB,
          createdAt: "2026-03-02T23:59:59.999Z",
          contentLength: 3,
          uploadHttpStatus: 201,
          secret,
        },
      ]);

      const secondRunNow = new Date("2026-03-04T03:15:00.000Z");
      await exportMediaUsageHourly({
        s3Client,
        uploadPrefix: "core/",
        now: secondRunNow,
        projectBatchSize: 1,
      });

      expect(
        rowsFor(objects, "2026-03-01", projects).filter(
          (row) => row.hour === "2026-03-01T23:00:00.000Z",
        ),
      ).toEqual([
        {
          projectId: projectA,
          hour: "2026-03-01T23:00:00.000Z",
          contentType: "image/png",
          uploadHttpStatus: 201,
          mediaCount: 1,
          totalContentLength: 40,
        },
      ]);
      expect(rowsFor(objects, "2026-03-02", projects)).toContainEqual({
        projectId: projectB,
        hour: "2026-03-02T23:00:00.000Z",
        contentType: "image/png",
        uploadHttpStatus: 201,
        mediaCount: 1,
        totalContentLength: 3,
      });
      expect(rowsFor(objects, "2026-03-03", projects)).toEqual([
        {
          projectId: projectA,
          hour: "2026-03-03T00:00:00.000Z",
          contentType: "image/png",
          uploadHttpStatus: 201,
          mediaCount: 1,
          totalContentLength: 7,
        },
      ]);
      await expect(readMediaUsageWatermark(s3Client, "core/")).resolves.toEqual(
        day("2026-03-04"),
      );

      const afterSecondRun = new Map(objects);
      await exportMediaUsageHourly({
        s3Client,
        uploadPrefix: "core/",
        now: secondRunNow,
        projectBatchSize: 1,
      });
      expect(objects).toEqual(afterSecondRun);
    } finally {
      await prisma.media.deleteMany({
        where: { projectId: { in: projects } },
      });
    }
  });

  it("advances the watermark per written day so a failed run resumes after the last written day", async () => {
    const { objects, failNextUploadOf, s3Client } = createInMemoryStorage();
    objects.set(
      mediaUsageWatermarkKey("core/"),
      JSON.stringify({ exportedUntil: "2026-03-02T00:00:00.000Z" }),
    );
    const now = new Date("2026-03-08T03:15:00.000Z");
    failNextUploadOf.add(mediaUsageDayObjectKey("core/", day("2026-03-05")));

    await expect(
      exportMediaUsageHourly({ s3Client, uploadPrefix: "core/", now }),
    ).rejects.toThrow("Injected upload failure");
    await expect(readMediaUsageWatermark(s3Client, "core/")).resolves.toEqual(
      day("2026-03-05"),
    );

    const uploadFileBuffered = vi.mocked(s3Client.uploadFileBuffered);
    uploadFileBuffered.mockClear();
    await exportMediaUsageHourly({ s3Client, uploadPrefix: "core/", now });

    expect(
      uploadFileBuffered.mock.calls.map(([{ fileName }]) => fileName),
    ).toEqual(
      ["2026-03-05", "2026-03-06", "2026-03-07"].map((value) =>
        mediaUsageDayObjectKey("core/", day(value)),
      ),
    );
    await expect(readMediaUsageWatermark(s3Client, "core/")).resolves.toEqual(
      day("2026-03-08"),
    );
  });

  it("never moves the watermark back when an overlapping run advanced it", async () => {
    const { objects, onUploadOf, s3Client } = createInMemoryStorage();
    const watermarkKey = mediaUsageWatermarkKey("core/");
    objects.set(
      watermarkKey,
      JSON.stringify({ exportedUntil: "2026-03-02T00:00:00.000Z" }),
    );
    onUploadOf.set(mediaUsageDayObjectKey("core/", day("2026-03-02")), () =>
      objects.set(
        watermarkKey,
        JSON.stringify({ exportedUntil: "2026-03-08T00:00:00.000Z" }),
      ),
    );

    const result = await exportMediaUsageHourly({
      s3Client,
      uploadPrefix: "core/",
      now: new Date("2026-03-08T03:15:00.000Z"),
      maxDaysPerRun: 2,
    });

    expect(result).toEqual({
      exportedUntil: day("2026-03-08"),
      hasMoreDays: false,
    });
    await expect(readMediaUsageWatermark(s3Client, "core/")).resolves.toEqual(
      day("2026-03-08"),
    );
  });

  it("caps the days per run and continues from the watermark until no closed day is pending", async () => {
    const { objects, s3Client } = createInMemoryStorage();
    objects.set(
      mediaUsageWatermarkKey("core/"),
      JSON.stringify({ exportedUntil: "2026-03-02T00:00:00.000Z" }),
    );
    const now = new Date("2026-03-10T03:15:00.000Z");
    const uploadFileBuffered = vi.mocked(s3Client.uploadFileBuffered);

    const runs = [];
    for (let run = 0; run < 4; run++) {
      uploadFileBuffered.mockClear();
      const result = await exportMediaUsageHourly({
        s3Client,
        uploadPrefix: "core/",
        now,
        lookbackDays: 3,
        maxDaysPerRun: 3,
      });
      runs.push({
        uploadedDays: uploadFileBuffered.mock.calls.map(([{ fileName }]) =>
          fileName.replace(/^.*date=(\d{4}-\d{2}-\d{2})\/.*$/, "$1"),
        ),
        exportedUntil: result.exportedUntil?.toISOString(),
        hasMoreDays: result.hasMoreDays,
      });
    }

    expect(runs).toEqual([
      {
        uploadedDays: ["2026-03-02", "2026-03-03", "2026-03-04"],
        exportedUntil: "2026-03-05T00:00:00.000Z",
        hasMoreDays: true,
      },
      {
        uploadedDays: ["2026-03-05", "2026-03-06", "2026-03-07"],
        exportedUntil: "2026-03-08T00:00:00.000Z",
        hasMoreDays: true,
      },
      {
        uploadedDays: ["2026-03-07", "2026-03-08", "2026-03-09"],
        exportedUntil: "2026-03-10T00:00:00.000Z",
        hasMoreDays: false,
      },
      {
        uploadedDays: ["2026-03-07", "2026-03-08", "2026-03-09"],
        exportedUntil: "2026-03-10T00:00:00.000Z",
        hasMoreDays: false,
      },
    ]);
  });
});

describe("processMediaUsageExportJob", () => {
  it("defers the job without exporting while another run holds the lock", async () => {
    const lockKey = "langfuse:core-data:media-usage-export";
    await redis!.set(lockKey, "other-run", "EX", 60);
    const { s3Client } = createInMemoryStorage();
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);

    try {
      const thrown = await processMediaUsageExportJob(
        { token: "token-1", moveToDelayed } as unknown as Job,
        { s3Client, uploadPrefix: "core/" },
      ).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(DelayedError);
      expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), "token-1");
      expect(s3Client.uploadFileBuffered).not.toHaveBeenCalled();
      await expect(redis!.get(lockKey)).resolves.toBe("other-run");
    } finally {
      await redis!.del(lockKey);
    }
  });
});
