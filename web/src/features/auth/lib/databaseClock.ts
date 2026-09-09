import { prisma } from "@langfuse/shared/src/db";

type PrismaQueryable = {
  $queryRaw: (typeof prisma)["$queryRaw"];
};

/**
 * Read the Postgres clock so login and revocation timestamps share one
 * authoritative timeline across web replicas.
 */
export async function getDatabaseNow(
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ now: Date }[]>`
    SELECT timezone('UTC', clock_timestamp()) AS now
  `;
  if (!row?.now) {
    throw new Error("Failed to read database clock");
  }
  return row.now;
}

export async function getSessionLoginAt(
  email: string,
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ loginAt: Date }[]>`
    SELECT GREATEST(
      timezone('UTC', clock_timestamp()),
      COALESCE(
        "sessions_valid_after" + INTERVAL '1 millisecond',
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

export async function advanceSessionsValidAfterForUser(
  userId: string,
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ sessionsValidAfter: Date }[]>`
    UPDATE "users"
    SET "sessions_valid_after" = timezone('UTC', clock_timestamp())
    WHERE "id" = ${userId}
    RETURNING "sessions_valid_after" AS "sessionsValidAfter"
  `;
  if (!row?.sessionsValidAfter) {
    throw new Error("Failed to advance session revocation timestamp");
  }
  return row.sessionsValidAfter;
}

export async function advanceSessionsValidAfterForEmail(
  email: string,
  db: PrismaQueryable = prisma,
): Promise<Date> {
  const [row] = await db.$queryRaw<{ sessionsValidAfter: Date }[]>`
    UPDATE "users"
    SET "sessions_valid_after" = timezone('UTC', clock_timestamp())
    WHERE "email" = ${email.toLowerCase()}
    RETURNING "sessions_valid_after" AS "sessionsValidAfter"
  `;
  if (!row?.sessionsValidAfter) {
    throw new Error("Failed to advance session revocation timestamp");
  }
  return row.sessionsValidAfter;
}
