import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  advanceSessionsValidAfterForUser,
  getDatabaseNow,
  getSessionLoginAt,
} from "@/src/features/auth/lib/databaseClock";
import { prisma } from "@langfuse/shared/src/db";

describe("database session clock", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  });

  it("returns a Date from Postgres clock_timestamp", async () => {
    const before = Date.now() - 5_000;
    const now = await getDatabaseNow(prisma);
    const after = Date.now() + 5_000;

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("orders a new login strictly after the revocation boundary", async () => {
    const id = randomUUID();
    const email = `${id}@example.com`;
    userIds.push(id);
    await prisma.user.create({ data: { id, email } });

    const sessionsValidAfter = await advanceSessionsValidAfterForUser(
      id,
      prisma,
    );
    const loginAt = await getSessionLoginAt(email, prisma);

    expect(loginAt.getTime()).toBeGreaterThan(sessionsValidAfter.getTime());
  });
});
