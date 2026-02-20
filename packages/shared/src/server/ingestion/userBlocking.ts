import { prisma } from "../../db";
import { traceException, recordIncrement } from "../instrumentation";
import { logger } from "../logger";

export async function blockUser(params: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const { projectId, userId } = params;

  if (!projectId || !userId) {
    throw new Error("Project ID and User ID are required");
  }

  try {
    await prisma.userBlockList.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      create: {
        projectId,
        userId,
      },
      update: {
        createdAt: new Date(),
      },
    });
  } catch (error) {
    traceException(error);
    throw error;
  }
}

export async function unblockUser(params: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const { projectId, userId } = params;

  if (!projectId || !userId) {
    throw new Error("Project ID and User ID are required");
  }

  try {
    await prisma.userBlockList.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return; // User wasn't blocked
    }
    traceException(error);
    throw error;
  }
}

export async function getBlockedUsers(params: {
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<{
  users: Array<{
    id: string;
    userId: string;
    createdAt: Date;
  }>;
  totalCount: number;
}> {
  const { projectId, limit = 100, offset = 0 } = params;

  if (!projectId) {
    throw new Error("Project ID is required");
  }

  try {
    const [users, totalCount] = await Promise.all([
      prisma.userBlockList.findMany({
        where: { projectId },
        select: {
          id: true,
          userId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.userBlockList.count({
        where: { projectId },
      }),
    ]);

    return { users, totalCount };
  } catch (error) {
    traceException(error);
    throw error;
  }
}

export async function checkBlockedUsers(params: {
  projectId: string;
  userIds: string[];
}): Promise<Set<string>> {
  const { projectId, userIds } = params;

  if (!projectId || userIds.length === 0) {
    return new Set();
  }

  try {
    const blockedUsers = await prisma.userBlockList.findMany({
      where: { projectId, userId: { in: userIds } },
      select: { userId: true },
    });

    return new Set(blockedUsers.map((user) => user.userId));
  } catch (error) {
    traceException(error);
    return new Set();
  }
}

/**
 * Shared service to filter events for blocked users across all ingestion pathways.
 * Follows the same optimized pattern as processEventBatch.ts for consistency.
 */
export async function filterEventsForBlockedUsers<T extends { body: any }>(
  events: T[],
  projectId: string,
): Promise<T[]> {
  if (events.length === 0) return events;

  // Collect userIds from ALL event types that have userId fields
  const userIds = [
    ...new Set(
      events
        .map((event) => event.body?.userId)
        .filter((userId): userId is string => Boolean(userId?.trim())),
    ),
  ];

  // If no userIds found, return all events unfiltered
  if (userIds.length === 0) return events;

  // Check which users are blocked
  let blocked = new Set<string>();
  try {
    blocked = await checkBlockedUsers({
      projectId,
      userIds,
    });
  } catch (error) {
    // Log error but don't throw to avoid breaking the ingestion pipeline
    traceException(error);
    // Return all events unfiltered if blocking check fails (fail-safe behavior)
    return events;
  }

  // If no blocked users, return all events unfiltered
  if (blocked.size === 0) return events;

  // Partition events by userId presence for optimized filtering
  const [eventsWithUserId, eventsWithoutUserId] = events.reduce(
    (acc, event) => {
      if (event.body?.userId) {
        acc[0].push(event);
      } else {
        acc[1].push(event);
      }
      return acc;
    },
    [[] as T[], [] as T[]],
  );

  // Filter only events with userId (no conditionals in hot path)
  const allowedEventsWithUserId = eventsWithUserId.filter((event) => {
    const userId = event.body?.userId;
    return userId ? !blocked.has(userId) : true;
  });

  // Record metrics and log blocking activity
  const blockedEventCount =
    eventsWithUserId.length - allowedEventsWithUserId.length;
  if (blockedEventCount > 0) {
    const blockedUserIds = Array.from(blocked).filter((userId) =>
      eventsWithUserId.some((event) => event.body?.userId === userId),
    );

    // Record metrics
    recordIncrement(
      "langfuse.user_blocking.events_blocked",
      blockedEventCount,
      {
        projectId,
      },
    );
    recordIncrement(
      "langfuse.user_blocking.users_blocked",
      blockedUserIds.length,
      {
        projectId,
      },
    );

    // Structured logging with condensed context
    logger.info("Events filtered for blocked users", {
      projectId,
      blockedEvents: blockedEventCount,
      blockedUsers: blockedUserIds.length,
      totalEvents: events.length,
    });
  }

  // Combine results (events without userId + allowed events with userId)
  return [...eventsWithoutUserId, ...allowedEventsWithUserId];
}
