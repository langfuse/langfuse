import { logger, type StorageService } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { uploadTableCoreDataJsonl } from "./coreDataS3ExportQueue";

// Mirrors the ClickHouse analytics views (analytics_traces, analytics_scores,
// analytics_observations): one row per project and UTC hour, exported only for
// closed periods and picked up downstream by a cursor on the period. Rows are
// grouped into one object per closed UTC day, written once.
const MEDIA_USAGE_TABLE_NAME = "mediaUsageHourly";
const MEDIA_USAGE_PROJECT_BATCH_SIZE = 1_000;
// Closed UTC days checked on every run: yesterday and the two days before it.
const MEDIA_USAGE_LOOKBACK_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const addUtcDays = (day: Date, days: number) =>
  new Date(day.getTime() + days * DAY_MS);

// `YYYY/MM/DD` of a UTC day, zero-padded.
const formatUtcDayPath = (day: Date) =>
  day.toISOString().slice(0, 10).replaceAll("-", "/");

// `created_at` is `timestamp without time zone` and is read as UTC wall-clock
// time, as Prisma does. Bounds are passed as plain timestamps so the comparison
// never goes through the session TimeZone. Rows inserted without an explicit
// `created_at` get the column default, which follows the writer's session
// TimeZone.
const toPgUtcTimestamp = (date: Date) =>
  date.toISOString().replace("T", " ").replace("Z", "");

// The table name doubles as the S3 object base name, so a day lands at
// `{prefix}mediaUsageHourly/YYYY/MM/DD.jsonl`.
const mediaUsageDayTableName = (day: Date) =>
  `${MEDIA_USAGE_TABLE_NAME}/${formatUtcDayPath(day)}`;

const mediaUsageDayKey = (uploadPrefix: string, day: Date) =>
  `${uploadPrefix}${mediaUsageDayTableName(day)}.jsonl`;

/** Closed UTC days of the look-back window, oldest first. */
const getMediaUsageLookbackDays = (now: Date): Date[] => {
  const today = toUtcDay(now);
  return Array.from({ length: MEDIA_USAGE_LOOKBACK_DAYS }, (_, index) =>
    addUtcDays(today, index - MEDIA_USAGE_LOOKBACK_DAYS),
  );
};

const mediaUsageDayExists = async (
  s3Client: StorageService,
  uploadPrefix: string,
  day: Date,
): Promise<boolean> => {
  const key = mediaUsageDayKey(uploadPrefix, day);
  const files = await s3Client.listFiles(key);
  return files.some((file) => file.file === key);
};

type MediaUsageHourlyQueryRow = {
  projectId: string;
  hour: string;
  contentType: string;
  mediaCount: bigint | number;
  totalContentLength: bigint | number;
};

// `project_id = ANY(...)` plus a closed `created_at` range is answered from the
// (project_id, created_at) index, so a query reads at most one project batch
// for one day. Raw SQL because Prisma's `groupBy` cannot bucket by hour.
// `created_at` is a `timestamp` without time zone and is read as UTC, which
// holds when Postgres runs in UTC. Rows resume strictly after `after` on the
// (project, hour, content type) key.
const queryMediaUsageHourly = ({
  projectIds,
  from,
  to,
  after,
  take,
}: {
  projectIds: string[];
  from: Date;
  to: Date;
  after: MediaUsageHourlyQueryRow | null;
  take: number;
}) => {
  const hourSql = Prisma.sql`to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24":00:00.000Z"')`;
  const afterSql = after
    ? Prisma.sql`AND (project_id, ${hourSql}, content_type) > (${after.projectId}, ${after.hour}, ${after.contentType})`
    : Prisma.empty;

  return prisma.$queryRaw<MediaUsageHourlyQueryRow[]>`
    SELECT
      project_id AS "projectId",
      ${hourSql} AS "hour",
      content_type AS "contentType",
      COUNT(*)::bigint AS "mediaCount",
      SUM(content_length)::bigint AS "totalContentLength"
    FROM media
    WHERE project_id = ANY(${projectIds}::text[])
      AND created_at >= ${toPgUtcTimestamp(from)}::timestamp
      AND created_at < ${toPgUtcTimestamp(to)}::timestamp
      ${afterSql}
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
    LIMIT ${take}
  `;
};

/** Exports the BigInt aggregates as numbers, since JSON.stringify throws on BigInt. */
const mapMediaUsageHourlyRow = (row: MediaUsageHourlyQueryRow) => ({
  projectId: row.projectId,
  hour: row.hour,
  contentType: row.contentType,
  mediaCount: Number(row.mediaCount),
  totalContentLength: Number(row.totalContentLength),
});

// One keyset page of a day. The rows of a day are walked in (project, hour,
// content type) order across batches of projects that existed by the end of
// the day, so every project is covered; the batch size only bounds the
// `ANY(...)` list. A page may span batches and only comes back short once the
// last project is exhausted.
const fetchMediaUsageDayPage = async ({
  day,
  lastRow,
  take,
  projectBatchSize,
}: {
  day: Date;
  lastRow: MediaUsageHourlyQueryRow | null;
  take: number;
  projectBatchSize: number;
}): Promise<MediaUsageHourlyQueryRow[]> => {
  const from = day;
  const to = addUtcDays(day, 1);
  const rows: MediaUsageHourlyQueryRow[] = [];
  let projectIdFilter: { gte: string } | { gt: string } | undefined = lastRow
    ? { gte: lastRow.projectId }
    : undefined;
  let after = lastRow;

  while (rows.length < take) {
    const projects: Array<{ id: string }> = await prisma.project.findMany({
      where: {
        createdAt: { lt: to },
        ...(projectIdFilter ? { id: projectIdFilter } : {}),
      },
      orderBy: { id: "asc" },
      select: { id: true },
      take: projectBatchSize,
    });
    if (projects.length === 0) {
      break;
    }

    rows.push(
      ...(await queryMediaUsageHourly({
        projectIds: projects.map((project) => project.id),
        from,
        to,
        after,
        take: take - rows.length,
      })),
    );

    if (projects.length < projectBatchSize) {
      break;
    }
    projectIdFilter = { gt: projects[projects.length - 1].id };
    after = null;
  }

  return rows;
};

/**
 * Writes one JSONL object per closed UTC day with media counts and bytes per
 * project, hour and content type. Each run checks yesterday and the two days
 * before it and writes every day whose object does not exist yet, so a day
 * missed by a failed run is filled in by the next one. Existing day objects are
 * never rewritten and no history before the look-back window is exported. Counts
 * and bytes only: ids, hashes, bucket locations, upload status and errors, and
 * media association tables are not exported.
 */
export const exportMediaUsageHourly = async ({
  s3Client,
  uploadPrefix,
  now = new Date(),
  projectBatchSize = MEDIA_USAGE_PROJECT_BATCH_SIZE,
}: {
  s3Client: StorageService;
  uploadPrefix: string;
  now?: Date;
  projectBatchSize?: number;
}): Promise<void> => {
  let exportedDays = 0;
  for (const day of getMediaUsageLookbackDays(now)) {
    if (await mediaUsageDayExists(s3Client, uploadPrefix, day)) {
      continue;
    }

    await uploadTableCoreDataJsonl({
      s3Client,
      uploadPrefix,
      tableName: mediaUsageDayTableName(day),
      fetchPage: ({ lastRow, take }) =>
        fetchMediaUsageDayPage({ day, lastRow, take, projectBatchSize }),
      mapRow: mapMediaUsageHourlyRow,
    });
    exportedDays++;
  }

  logger.info(
    `[CORE DATA] Finished ${MEDIA_USAGE_TABLE_NAME} (exported ${exportedDays} of ${MEDIA_USAGE_LOOKBACK_DAYS} look-back days)`,
  );
};
