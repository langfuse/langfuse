import { Readable } from "node:stream";
import { logger, type StorageService } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

// Mirrors the ClickHouse analytics views (analytics_traces, analytics_scores,
// analytics_observations): one row per project and UTC hour, exported only for
// closed periods and picked up downstream by a cursor on the period. Rows are
// grouped into one object per closed UTC day so a rerun of a day rewrites the
// same key instead of appending.
const MEDIA_USAGE_TABLE_NAME = "mediaUsageHourly";
// Every run re-exports this many of the most recent closed days, so upload
// status updates and rows committed just after midnight still land in their
// day. Changes to older days are not re-exported.
const MEDIA_USAGE_LOOKBACK_DAYS = 3;
const MEDIA_USAGE_PROJECT_BATCH_SIZE = 1_000;
const MEDIA_USAGE_PART_SIZE_BYTES = 100 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const addUtcDays = (day: Date, days: number) =>
  new Date(day.getTime() + days * DAY_MS);

const formatUtcDay = (day: Date) => day.toISOString().slice(0, 10);

// `created_at` is `timestamp without time zone` and is read as UTC wall-clock
// time, as Prisma does. Bounds are passed as plain timestamps so the comparison
// never goes through the session TimeZone. Rows inserted without an explicit
// `created_at` get the column default, which follows the writer's session
// TimeZone.
const toPgUtcTimestamp = (date: Date) =>
  date.toISOString().replace("T", " ").replace("Z", "");

const mediaUsageDayObjectKey = (uploadPrefix: string, day: Date) =>
  `${uploadPrefix}${MEDIA_USAGE_TABLE_NAME}/date=${formatUtcDay(day)}/${MEDIA_USAGE_TABLE_NAME}.jsonl`;

const mediaUsageWatermarkKey = (uploadPrefix: string) =>
  `${uploadPrefix}${MEDIA_USAGE_TABLE_NAME}/_watermark.json`;

/**
 * Returns the UTC days to export, oldest first. Only closed days (before the
 * UTC day of `now`) are exported. Without a watermark the export backfills from
 * `backfillStart`; afterwards it exports every day from `exportedUntil` on,
 * plus the last `lookbackDays` closed days.
 */
const computeMediaUsageExportDays = ({
  now,
  exportedUntil,
  backfillStart,
  minStartDay,
  lookbackDays = MEDIA_USAGE_LOOKBACK_DAYS,
}: {
  now: Date;
  exportedUntil: Date | null;
  backfillStart: Date | null;
  minStartDay: Date;
  lookbackDays?: number;
}): Date[] => {
  const lastClosedDay = addUtcDays(toUtcDay(now), -1);
  let start: Date;
  if (exportedUntil) {
    const lookbackStart = addUtcDays(lastClosedDay, -(lookbackDays - 1));
    start = exportedUntil < lookbackStart ? exportedUntil : lookbackStart;
  } else if (backfillStart) {
    start = toUtcDay(backfillStart);
  } else {
    return [];
  }
  if (start < minStartDay) {
    start = minStartDay;
  }

  const days: Date[] = [];
  for (let day = start; day <= lastClosedDay; day = addUtcDays(day, 1)) {
    days.push(day);
  }
  return days;
};

/**
 * The watermark is the exclusive end (00:00 UTC of the next day) of the last
 * day whose object was written. It is stored next to the day objects so it
 * lives and dies with the exported data.
 */
const readMediaUsageWatermark = async (
  s3Client: StorageService,
  uploadPrefix: string,
): Promise<Date | null> => {
  const key = mediaUsageWatermarkKey(uploadPrefix);
  const files = await s3Client.listFiles(key);
  if (!files.some((file) => file.file === key)) {
    return null;
  }

  const parsed: unknown = JSON.parse(await s3Client.download(key));
  const exportedUntil =
    parsed && typeof parsed === "object" && "exportedUntil" in parsed
      ? parsed.exportedUntil
      : undefined;
  const watermark =
    typeof exportedUntil === "string" ? new Date(exportedUntil) : undefined;
  if (
    !watermark ||
    Number.isNaN(watermark.getTime()) ||
    toUtcDay(watermark).getTime() !== watermark.getTime()
  ) {
    throw new TypeError(`Invalid media usage watermark at ${key}`);
  }
  return watermark;
};

// Re-reads the stored watermark right before writing and keeps the later
// value, so a run that is behind an overlapping run never moves it backwards.
// Returns the watermark in effect afterwards.
const advanceMediaUsageWatermark = async (
  s3Client: StorageService,
  uploadPrefix: string,
  exportedUntil: Date,
): Promise<Date> => {
  const stored = await readMediaUsageWatermark(s3Client, uploadPrefix);
  if (stored && stored >= exportedUntil) {
    return stored;
  }
  await s3Client.uploadFile({
    fileName: mediaUsageWatermarkKey(uploadPrefix),
    fileType: "application/json",
    data: JSON.stringify({ exportedUntil: exportedUntil.toISOString() }),
  });
  return exportedUntil;
};

// Media rows reference an existing project, so they cannot predate the oldest
// project.
const getMediaUsageBackfillStart = async (): Promise<Date | null> => {
  const { _min } = await prisma.project.aggregate({
    _min: { createdAt: true },
  });
  return _min.createdAt;
};

type MediaUsageHourlyQueryRow = {
  projectId: string;
  hour: string;
  contentType: string;
  uploadHttpStatus: number | null;
  mediaCount: bigint | number;
  totalContentLength: bigint | number;
};

// `project_id = ANY(...)` plus a closed `created_at` range is answered from the
// (project_id, created_at) index, so a query reads at most one project batch
// for one day.
const queryMediaUsageHourly = ({
  projectIds,
  from,
  to,
}: {
  projectIds: string[];
  from: Date;
  to: Date;
}) =>
  prisma.$queryRaw<MediaUsageHourlyQueryRow[]>`
    SELECT
      project_id AS "projectId",
      to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24":00:00.000Z"') AS "hour",
      content_type AS "contentType",
      upload_http_status AS "uploadHttpStatus",
      COUNT(*)::bigint AS "mediaCount",
      SUM(content_length)::bigint AS "totalContentLength"
    FROM media
    WHERE project_id = ANY(${projectIds}::text[])
      AND created_at >= ${toPgUtcTimestamp(from)}::timestamp
      AND created_at < ${toPgUtcTimestamp(to)}::timestamp
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2, 3, 4 NULLS LAST
  `;

/** Exports the BigInt aggregates as numbers, since JSON.stringify throws on BigInt. */
const mapMediaUsageHourlyRow = (row: MediaUsageHourlyQueryRow) => ({
  projectId: row.projectId,
  hour: row.hour,
  contentType: row.contentType,
  uploadHttpStatus: row.uploadHttpStatus,
  mediaCount: Number(row.mediaCount),
  totalContentLength: Number(row.totalContentLength),
});

async function* createMediaUsageDayJsonlStream({
  day,
  projectBatchSize,
  onRows,
}: {
  day: Date;
  projectBatchSize: number;
  onRows: (rowCount: number) => void;
}): AsyncGenerator<string> {
  const from = day;
  const to = addUtcDays(day, 1);
  let afterProjectId: string | undefined;
  let isFirstRow = true;

  while (true) {
    const projects = await prisma.project.findMany({
      where: {
        createdAt: { lt: to },
        ...(afterProjectId ? { id: { gt: afterProjectId } } : {}),
      },
      orderBy: { id: "asc" },
      select: { id: true },
      take: projectBatchSize,
    });
    if (projects.length === 0) {
      break;
    }

    const rows = await queryMediaUsageHourly({
      projectIds: projects.map((project) => project.id),
      from,
      to,
    });
    for (const row of rows) {
      yield `${isFirstRow ? "" : "\n"}${JSON.stringify(mapMediaUsageHourlyRow(row))}`;
      isFirstRow = false;
    }
    onRows(rows.length);

    if (projects.length < projectBatchSize) {
      break;
    }
    afterProjectId = projects[projects.length - 1].id;
  }
}

const uploadMediaUsageDay = async ({
  s3Client,
  uploadPrefix,
  day,
  projectBatchSize,
}: {
  s3Client: StorageService;
  uploadPrefix: string;
  day: Date;
  projectBatchSize: number;
}) => {
  let rowCount = 0;
  await s3Client.uploadFileBuffered({
    fileName: mediaUsageDayObjectKey(uploadPrefix, day),
    fileType: "application/x-ndjson",
    data: Readable.from(
      createMediaUsageDayJsonlStream({
        day,
        projectBatchSize,
        onRows: (pageRowCount) => {
          rowCount += pageRowCount;
        },
      }),
    ),
    partSizeBytes: MEDIA_USAGE_PART_SIZE_BYTES,
  });
  return rowCount;
};

/**
 * Writes one JSONL object per closed UTC day with media counts and bytes per
 * project, hour, content type and upload status, one day at a time, advancing
 * the watermark after each written day. Stops starting new days once
 * `timeBudgetMs` has elapsed; the next run continues from the watermark. At
 * least one day is attempted per run. Counts and bytes only: ids, hashes,
 * bucket locations, upload errors and media association tables are not
 * exported.
 */
export const exportMediaUsageHourly = async ({
  s3Client,
  uploadPrefix,
  now = new Date(),
  lookbackDays = MEDIA_USAGE_LOOKBACK_DAYS,
  timeBudgetMs = env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_TIME_BUDGET_MINUTES *
    60_000,
  minStartDay = new Date(
    `${env.LANGFUSE_S3_CORE_DATA_MEDIA_USAGE_EXPORT_MIN_START_DATE}T00:00:00.000Z`,
  ),
  projectBatchSize = MEDIA_USAGE_PROJECT_BATCH_SIZE,
}: {
  s3Client: StorageService;
  uploadPrefix: string;
  now?: Date;
  lookbackDays?: number;
  timeBudgetMs?: number;
  minStartDay?: Date;
  projectBatchSize?: number;
}): Promise<void> => {
  const startedAt = Date.now();
  const watermark = await readMediaUsageWatermark(s3Client, uploadPrefix);
  const days = computeMediaUsageExportDays({
    now,
    exportedUntil: watermark,
    backfillStart: watermark ? null : await getMediaUsageBackfillStart(),
    minStartDay,
    lookbackDays,
  });

  if (days.length === 0) {
    logger.info(
      `[CORE DATA] No closed days to export for ${MEDIA_USAGE_TABLE_NAME}`,
    );
    return;
  }
  logger.info(
    `[CORE DATA] Exporting ${MEDIA_USAGE_TABLE_NAME} for up to ${days.length} days (${formatUtcDay(days[0])} to ${formatUtcDay(days[days.length - 1])}, exported until ${watermark?.toISOString() ?? "none"})`,
  );

  let exportedUntil = watermark;
  let exportedDays = 0;
  for (const day of days) {
    if (exportedDays > 0 && Date.now() - startedAt >= timeBudgetMs) {
      break;
    }

    try {
      const rowCount = await uploadMediaUsageDay({
        s3Client,
        uploadPrefix,
        day,
        projectBatchSize,
      });
      logger.debug(
        `[CORE DATA] Exported ${MEDIA_USAGE_TABLE_NAME} for ${formatUtcDay(day)} (${rowCount} rows)`,
      );
    } catch (error) {
      logger.error(
        `[CORE DATA] Export of ${MEDIA_USAGE_TABLE_NAME} failed for ${formatUtcDay(day)}`,
        error,
      );
      throw error;
    }
    exportedDays++;

    const dayEnd = addUtcDays(day, 1);
    if (!exportedUntil || dayEnd > exportedUntil) {
      exportedUntil = await advanceMediaUsageWatermark(
        s3Client,
        uploadPrefix,
        dayEnd,
      );
    }
  }

  const lastClosedDayEnd = addUtcDays(days[days.length - 1], 1);
  logger.info(
    `[CORE DATA] Finished ${MEDIA_USAGE_TABLE_NAME} (exported ${exportedDays} days, exported until ${exportedUntil?.toISOString()}${exportedUntil && exportedUntil < lastClosedDayEnd ? ", backfill continues in the next run" : ""})`,
  );
};
