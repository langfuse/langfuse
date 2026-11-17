import { logger, redis } from "@langfuse/shared/src/server";

/**
 * Per-user record of the last project a user opened, kept next to the
 * per-browser `langfuse.project` cookie so a new device or a cleared cookie
 * still lands in the right project. It is a hint, not a source of truth:
 * every read is re-validated against the session's project access, and
 * Redis unavailability leaves landing to the normal accessible-project fallback.
 */
const LAST_VISITED_PROJECT_TTL_SECONDS = 60 * 60 * 24 * 90;
const REDIS_TIMEOUT_MS = 250;

const lastVisitedProjectKey = (userId: string) =>
  `langfuse:last-visited-project:${userId}`;

/** Bounds shared-client commands whose offline queue can otherwise wait indefinitely. */
async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Project navigation Redis operation timed out")),
      REDIS_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function recordLastVisitedProject({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}): Promise<void> {
  if (!redis || redis.status !== "ready") return;
  try {
    await withTimeout(
      redis.set(
        lastVisitedProjectKey(userId),
        projectId,
        "EX",
        LAST_VISITED_PROJECT_TTL_SECONDS,
      ),
    );
  } catch (error) {
    logger.warn("Failed to record the last visited project", { error });
  }
}

export async function forgetLastVisitedProject(userId: string): Promise<void> {
  if (!redis || redis.status !== "ready") return;
  try {
    await withTimeout(redis.del(lastVisitedProjectKey(userId)));
  } catch (error) {
    logger.warn("Failed to forget the last visited project", { error });
  }
}

export async function readLastVisitedProject(
  userId: string,
): Promise<string | null> {
  if (!redis || redis.status !== "ready") return null;
  try {
    return await withTimeout(redis.get(lastVisitedProjectKey(userId)));
  } catch (error) {
    logger.warn("Failed to read the last visited project", { error });
    return null;
  }
}
