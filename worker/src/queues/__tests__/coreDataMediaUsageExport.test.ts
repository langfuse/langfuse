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
    `${uploadPrefix}mediaUsageHourly/${isoDay(day).replaceAll("-", "/")}.jsonl`;

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

  const spyOnDayUploads = () => {
    const uploadedDays: string[] = [];
    const original = s3Client.uploadFileBuffered.bind(s3Client);
    vi.spyOn(s3Client, "uploadFileBuffered").mockImplementation(
      async (args) => {
        const match = args.fileName.match(
          /mediaUsageHourly\/(\d{4})\/(\d{2})\/(\d{2})\.jsonl$/,
        );
        if (match) uploadedDays.push(match.slice(1).join("-"));
        return original(args);
      },
    );
    return uploadedDays;
  };

  it("writes one object per closed UTC day with hourly rows and only count and byte columns", async () => {
    // Upload status does not split groups.
    await createMedia({ createdAt: atHour(-3, 10, 5), contentLength: 100 });
    await createMedia({
      createdAt: atHour(-3, 10, 55),
      uploadHttpStatus: null,
      contentLength: 250,
    });
    await createMedia({
      createdAt: atHour(-3, 10, 30),
      contentType: "audio/mpeg",
      contentLength: 40,
    });
    await createMedia({ createdAt: atHour(-3, 23, 59), contentLength: 7 });
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
        mediaCount: 1,
        totalContentLength: 40,
      },
      {
        projectId,
        hour: `${isoDay(dayAt(-3))}T10:00:00.000Z`,
        contentType: "image/png",
        mediaCount: 2,
        totalContentLength: 350,
      },
      {
        projectId,
        hour: `${isoDay(dayAt(-3))}T23:00:00.000Z`,
        contentType: "image/png",
        mediaCount: 1,
        totalContentLength: 7,
      },
    ]);
    expect(Object.keys((await readDayRows(dayAt(-3)))[0])).toEqual([
      "projectId",
      "hour",
      "contentType",
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
        mediaCount: 1,
        totalContentLength: 9,
      },
    ]);
    expect(await exists(dayKey(dayAt(0)))).toBe(false);

    const allContent = (
      await Promise.all(
        [-3, -2, -1].map((offset) => s3Client.download(dayKey(dayAt(offset)))),
      )
    ).join("\n");
    expect(allContent).not.toContain("secret");
  });

  it("pages through a day with more groups than one page without gaps or repeats", async () => {
    const contentTypes = Array.from(
      { length: 1_005 },
      (_, index) => `application/x-test-${String(index).padStart(4, "0")}`,
    );
    await prisma.media.createMany({
      data: contentTypes.map((contentType) => {
        const id = randomUUID();
        return {
          id,
          projectId,
          sha256Hash: Buffer.alloc(33, id).toString("base64"),
          createdAt: atHour(-1, 5),
          bucketPath: `secret/${projectId}/${id}`,
          bucketName: "secret-bucket",
          contentType,
          contentLength: BigInt(1),
        };
      }),
    });

    await exportMediaUsage({ s3Client, uploadPrefix });

    const rows = await readDayRows(dayAt(-1));
    expect(rows.map((row) => row.contentType)).toEqual(contentTypes);
  });

  it("does not export days before the look-back window", async () => {
    await createMedia({ createdAt: atHour(-5, 12) });
    await createMedia({ createdAt: atHour(-4, 12) });
    await createMedia({ createdAt: atHour(-3, 12) });

    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(await exists(dayKey(dayAt(-5)))).toBe(false);
    expect(await exists(dayKey(dayAt(-4)))).toBe(false);
    expect(await exists(dayKey(dayAt(-3)))).toBe(true);
  });

  it("skips days whose object already exists and never rewrites it", async () => {
    await createMedia({ createdAt: atHour(-2, 8), contentLength: 20 });
    await s3Client.uploadFile({
      fileName: dayKey(dayAt(-2)),
      fileType: "application/x-ndjson",
      data: "existing\n",
    });
    const uploadedDays = spyOnDayUploads();

    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(uploadedDays).toEqual([isoDay(dayAt(-3)), isoDay(dayAt(-1))]);
    expect(await s3Client.download(dayKey(dayAt(-2)))).toBe("existing\n");

    // A later run finds every day of the window and writes nothing, so rows
    // that arrive late for an exported day are not re-exported.
    await createMedia({ createdAt: atHour(-1, 8), contentLength: 5 });
    uploadedDays.length = 0;
    await exportMediaUsage({ s3Client, uploadPrefix });
    expect(uploadedDays).toEqual([]);
    expect(await readDayRows(dayAt(-1))).toEqual([]);
  });

  it("fills in a day missed by a failed run on the next run", async () => {
    await createMedia({ createdAt: atHour(-2, 8), contentLength: 20 });
    await createMedia({ createdAt: atHour(-1, 8), contentLength: 30 });
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
    expect(await exists(dayKey(dayAt(-1)))).toBe(false);

    vi.restoreAllMocks();
    const uploadedDays = spyOnDayUploads();
    await exportMediaUsage({ s3Client, uploadPrefix });

    expect(uploadedDays).toEqual([isoDay(dayAt(-2)), isoDay(dayAt(-1))]);
    expect(await readDayRows(dayAt(-2))).toHaveLength(1);
    expect(await readDayRows(dayAt(-1))).toHaveLength(1);
  });
});
