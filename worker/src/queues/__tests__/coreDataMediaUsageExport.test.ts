import { randomUUID } from "crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  StorageServiceFactory,
  storageKeys,
  type StorageService,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { coreDataTableExports } from "../coreDataS3ExportQueue";

vi.mock("../../env", async () => {
  const actual = await vi.importActual<{ env: object }>("../../env");
  return { env: { ...actual.env } };
});

// The media usage export is the last core-data table export and is exercised
// only through that public entry.
const exportMediaUsage = (args: {
  s3Client: StorageService;
  uploadPrefix: string;
}) => coreDataTableExports[coreDataTableExports.length - 1](args);

const DAY_MS = 24 * 60 * 60 * 1000;
const todayUtc = new Date(
  Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  ),
);
// Midnight UTC of the day `offset` days from today (negative = past).
const dayAt = (offset: number) =>
  new Date(todayUtc.getTime() + offset * DAY_MS);
const isoDay = (day: Date) => day.toISOString().slice(0, 10);
const atHour = (offset: number, hour: number, minute = 0) =>
  new Date(dayAt(offset).getTime() + (hour * 60 + minute) * 60 * 1000);

const FAST_BUDGET_MINUTES = 1e-9;
const LONG_BUDGET_MINUTES = 60;

describe("coreDataTableExports media usage entry", () => {
  let s3Client: StorageService;
  let projectId: string;
  let uploadPrefix: string;

  beforeAll(() => {
    s3Client = StorageServiceFactory.getInstance({
      credentials: storageKeys(
        env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
        env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      ),
      bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  });

  beforeEach(async () => {
    uploadPrefix = `core-data-media-usage-test/${randomUUID()}/`;
    ({ projectId } = await createOrgProjectAndApiKey());
    // Media only counts for projects that existed when the day closed.
    await prisma.project.update({
      where: { id: projectId },
      data: { createdAt: dayAt(-60) },
    });
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_TIME_BUDGET_MINUTES =
      LONG_BUDGET_MINUTES;
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_MIN_START_DATE = isoDay(
      dayAt(-3),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const files = await s3Client.listFiles(uploadPrefix);
    if (files.length > 0) {
      await s3Client.deleteFiles(files.map((file) => file.file));
    }
  });

  const createMedia = ({
    createdAt,
    contentType = "image/png",
    contentLength = 100,
    uploadHttpStatus = 200,
  }: {
    createdAt: Date;
    contentType?: string;
    contentLength?: number;
    uploadHttpStatus?: number | null;
  }) => {
    const id = randomUUID();
    return prisma.media.create({
      data: {
        id,
        projectId,
        sha256Hash: Buffer.alloc(33, id).toString("base64"),
        createdAt,
        uploadHttpStatus,
        uploadHttpError:
          uploadHttpStatus === 500 ? "secret upload error" : null,
        bucketPath: `secret/${projectId}/${id}`,
        bucketName: "secret-bucket",
        contentType,
        contentLength: BigInt(contentLength),
      },
    });
  };

  const dayKey = (day: Date) =>
    `${uploadPrefix}mediaUsageHourly/date=${isoDay(day)}/mediaUsageHourly.jsonl`;
  const watermarkKey = () => `${uploadPrefix}mediaUsageHourly/_watermark.json`;

  const exists = async (key: string) =>
    (await s3Client.listFiles(key)).some((file) => file.file === key);

  const readDayRows = async (day: Date) => {
    const content = await s3Client.download(dayKey(day));
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((row) => row.projectId === projectId);
  };

  const readWatermark = async (): Promise<string | null> =>
    (await exists(watermarkKey()))
      ? JSON.parse(await s3Client.download(watermarkKey())).exportedUntil
      : null;

  const spyOnDayUploads = () => {
    const uploadedDays: string[] = [];
    const original = s3Client.uploadFileBuffered.bind(s3Client);
    vi.spyOn(s3Client, "uploadFileBuffered").mockImplementation(
      async (args) => {
        const match = args.fileName.match(/date=(\d{4}-\d{2}-\d{2})\//);
        if (match) uploadedDays.push(match[1]);
        return original(args);
      },
    );
    return uploadedDays;
  };

  it("writes one object per closed UTC day with hourly rows and only count and byte columns", async () => {
    await createMedia({ createdAt: atHour(-3, 10, 5), contentLength: 100 });
    await createMedia({ createdAt: atHour(-3, 10, 55), contentLength: 250 });
    await createMedia({
      createdAt: atHour(-3, 10, 30),
      contentType: "audio/mpeg",
      contentLength: 40,
    });
    await createMedia({
      createdAt: atHour(-3, 23, 59),
      uploadHttpStatus: null,
      contentLength: 7,
    });
    await createMedia({
      createdAt: atHour(-1, 0, 0),
      uploadHttpStatus: 500,
      contentLength: 9,
    });
    // The current UTC day is not closed yet.
    await createMedia({ createdAt: new Date(), contentLength: 1 });

    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(await readDayRows(dayAt(-3))).toEqual([
      {
        projectId,
        hour: `${isoDay(dayAt(-3))}T10:00:00.000Z`,
        contentType: "audio/mpeg",
        uploadHttpStatus: 200,
        mediaCount: 1,
        totalContentLength: 40,
      },
      {
        projectId,
        hour: `${isoDay(dayAt(-3))}T10:00:00.000Z`,
        contentType: "image/png",
        uploadHttpStatus: 200,
        mediaCount: 2,
        totalContentLength: 350,
      },
      {
        projectId,
        hour: `${isoDay(dayAt(-3))}T23:00:00.000Z`,
        contentType: "image/png",
        uploadHttpStatus: null,
        mediaCount: 1,
        totalContentLength: 7,
      },
    ]);
    expect(Object.keys((await readDayRows(dayAt(-3)))[0])).toEqual([
      "projectId",
      "hour",
      "contentType",
      "uploadHttpStatus",
      "mediaCount",
      "totalContentLength",
    ]);
    // A day without media still gets an (empty) object.
    expect(await readDayRows(dayAt(-2))).toEqual([]);
    expect(await readDayRows(dayAt(-1))).toEqual([
      {
        projectId,
        hour: `${isoDay(dayAt(-1))}T00:00:00.000Z`,
        contentType: "image/png",
        uploadHttpStatus: 500,
        mediaCount: 1,
        totalContentLength: 9,
      },
    ]);
    expect(await exists(dayKey(dayAt(0)))).toBe(false);
    expect(await readWatermark()).toBe(dayAt(0).toISOString());

    const allContent = (
      await Promise.all(
        [-3, -2, -1].map((offset) => s3Client.download(dayKey(dayAt(offset)))),
      )
    ).join("\n");
    expect(allContent).not.toContain("secret");
  });

  it("never exports days before the minimum start date", async () => {
    await createMedia({ createdAt: atHour(-5, 12) });
    await createMedia({ createdAt: atHour(-3, 12) });

    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(await exists(dayKey(dayAt(-5)))).toBe(false);
    expect(await exists(dayKey(dayAt(-4)))).toBe(false);
    expect(await exists(dayKey(dayAt(-3)))).toBe(true);

    // An older watermark does not pull the start before the minimum either.
    await s3Client.deleteFiles([dayKey(dayAt(-3))]);
    await s3Client.uploadFile({
      fileName: watermarkKey(),
      fileType: "application/json",
      data: JSON.stringify({ exportedUntil: dayAt(-10).toISOString() }),
    });
    const uploadedDays = spyOnDayUploads();
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_TIME_BUDGET_MINUTES =
      FAST_BUDGET_MINUTES;

    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(uploadedDays).toEqual([isoDay(dayAt(-3))]);
    expect(await readWatermark()).toBe(dayAt(-2).toISOString());
  });

  it("advances the watermark only after a day's object is written", async () => {
    const original = s3Client.uploadFileBuffered.bind(s3Client);
    vi.spyOn(s3Client, "uploadFileBuffered").mockImplementation(
      async (args) => {
        if (args.fileName === dayKey(dayAt(-2))) {
          throw new Error("upload failed");
        }
        return original(args);
      },
    );

    await expect(exportMediaUsage({ s3Client, uploadPrefix })).rejects.toThrow(
      "upload failed",
    );
    expect(await exists(dayKey(dayAt(-3)))).toBe(true);
    expect(await readWatermark()).toBe(dayAt(-2).toISOString());

    vi.restoreAllMocks();
    await exportMediaUsage({ s3Client, uploadPrefix });
    expect(await readWatermark()).toBe(dayAt(0).toISOString());
    expect(await exists(dayKey(dayAt(-1)))).toBe(true);
  });

  it("never moves the watermark backwards when another run advanced it meanwhile", async () => {
    const ahead = dayAt(5).toISOString();
    const original = s3Client.uploadFileBuffered.bind(s3Client);
    let overlapped = false;
    vi.spyOn(s3Client, "uploadFileBuffered").mockImplementation(
      async (args) => {
        const result = await original(args);
        if (!overlapped) {
          overlapped = true;
          await s3Client.uploadFile({
            fileName: watermarkKey(),
            fileType: "application/json",
            data: JSON.stringify({ exportedUntil: ahead }),
          });
        }
        return result;
      },
    );

    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(await readWatermark()).toBe(ahead);
  });

  it("rewrites the lookback days idempotently and leaves older days alone", async () => {
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_MIN_START_DATE = isoDay(
      dayAt(-5),
    );
    await createMedia({ createdAt: atHour(-5, 8), contentLength: 10 });
    await createMedia({ createdAt: atHour(-2, 8), contentLength: 20 });

    await exportMediaUsage({ s3Client, uploadPrefix });
    const firstRun = await Promise.all(
      [-5, -4, -3, -2, -1].map((offset) =>
        s3Client.download(dayKey(dayAt(offset))),
      ),
    );

    // No changes: a rerun rewrites the last 3 closed days with identical content.
    const uploadedDays = spyOnDayUploads();
    await exportMediaUsage({ s3Client, uploadPrefix });
    expect(uploadedDays.sort()).toEqual(
      [-3, -2, -1].map((offset) => isoDay(dayAt(offset))),
    );
    const secondRun = await Promise.all(
      [-5, -4, -3, -2, -1].map((offset) =>
        s3Client.download(dayKey(dayAt(offset))),
      ),
    );
    expect(secondRun).toEqual(firstRun);
    expect(await readWatermark()).toBe(dayAt(0).toISOString());

    // Late changes inside the lookback are picked up, older ones are not.
    await createMedia({ createdAt: atHour(-2, 8, 30), contentLength: 5 });
    await createMedia({ createdAt: atHour(-5, 9), contentLength: 5 });
    await exportMediaUsage({ s3Client, uploadPrefix });

    expect((await readDayRows(dayAt(-2)))[0]).toMatchObject({
      mediaCount: 2,
      totalContentLength: 25,
    });
    expect(await s3Client.download(dayKey(dayAt(-5)))).toBe(firstRun[0]);
    expect(await readWatermark()).toBe(dayAt(0).toISOString());
  });

  it("stops starting new days when the time budget is used up and resumes on the next run", async () => {
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_MIN_START_DATE = isoDay(
      dayAt(-5),
    );
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_TIME_BUDGET_MINUTES =
      FAST_BUDGET_MINUTES;
    const uploadedDays = spyOnDayUploads();

    // At least one day is attempted per run; the budget stops the rest.
    await exportMediaUsage({ s3Client, uploadPrefix });
    expect(uploadedDays).toEqual([isoDay(dayAt(-5))]);
    expect(await readWatermark()).toBe(dayAt(-4).toISOString());

    await exportMediaUsage({ s3Client, uploadPrefix });
    expect(uploadedDays.slice(1)).toEqual([isoDay(dayAt(-4))]);
    expect(await readWatermark()).toBe(dayAt(-3).toISOString());

    // With enough budget the next run catches up to the last closed day.
    env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_TIME_BUDGET_MINUTES =
      LONG_BUDGET_MINUTES;
    await exportMediaUsage({ s3Client, uploadPrefix });
    expect(uploadedDays.slice(2)).toEqual(
      [-3, -2, -1].map((offset) => isoDay(dayAt(offset))),
    );
    expect(await readWatermark()).toBe(dayAt(0).toISOString());
  });
});
