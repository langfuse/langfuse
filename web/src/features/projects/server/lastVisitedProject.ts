import { logger, redis } from "@langfuse/shared/src/server";

/**
 * Per-user record of the last project a user opened, kept next to the
 * per-browser `langfuse.project` cookie so a new device or a cleared cookie
 * still lands in the right project. It is a hint, not a source of truth:
 * every read is re-validated against the session's project access, and a
 * missing Redis simply falls back to the first accessible project.
 */
const LAST_VISITED_PROJECT_TTL_SECONDS = 60 * 60 * 24 * 90;

const lastVisitedProjectKey = (userId: string) =>
  `langfuse:last-visited-project:${userId}`;

export async function recordLastVisitedProject({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(
      lastVisitedProjectKey(userId),
      projectId,
      "EX",
      LAST_VISITED_PROJECT_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn("Failed to record the last visited project", { error });
  }
}

export async function readLastVisitedProject(
  userId: string,
): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(lastVisitedProjectKey(userId));
  } catch (error) {
    logger.warn("Failed to read the last visited project", { error });
    return null;
  }
}
