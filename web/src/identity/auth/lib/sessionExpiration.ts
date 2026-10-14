import { prisma } from "@langfuse/shared/src/db";

type PrismaQueryable = {
  $queryRaw: (typeof prisma)["$queryRaw"];
};

/**
 * Login and revocation timestamps are both read from the Postgres clock so
 * they share one authoritative timeline across web replicas. A login is
 * ordered strictly after any existing revocation boundary, which
 * `sessions_expired_at` stores at millisecond precision.
 */
export async function getSessionLoginAt(
  email: string,
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ loginAt: Date }[]>`
    SELECT GREATEST(
      timezone('UTC', clock_timestamp()),
      COALESCE(
        "sessions_expired_at" + INTERVAL '1 millisecond',
        '-infinity'::timestamp
      )
    ) AS "loginAt"
    FROM "users"
    WHERE "email" = ${email.toLowerCase()}
  `;
  if (!row?.loginAt) {
    throw new Error("Failed to read database login timestamp");
  }
  return row.loginAt;
}

export async function advanceSessionsExpiredAtForUser(
  userId: string,
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ sessionsExpiredAt: Date }[]>`
    UPDATE "users"
    SET "sessions_expired_at" = timezone('UTC', clock_timestamp())
    WHERE "id" = ${userId}
    RETURNING "sessions_expired_at" AS "sessionsExpiredAt"
  `;
  if (!row?.sessionsExpiredAt) {
    throw new Error("Failed to advance session revocation timestamp");
  }
  return row.sessionsExpiredAt;
}

export async function advanceSessionsExpiredAtForEmail(
  email: string,
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ sessionsExpiredAt: Date }[]>`
    UPDATE "users"
    SET "sessions_expired_at" = timezone('UTC', clock_timestamp())
    WHERE "email" = ${email.toLowerCase()}
    RETURNING "sessions_expired_at" AS "sessionsExpiredAt"
  `;
  if (!row?.sessionsExpiredAt) {
    throw new Error("Failed to advance session revocation timestamp");
  }
  return row.sessionsExpiredAt;
}
