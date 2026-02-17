import { prisma } from "../../db";
import { traceException } from "../instrumentation";

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
