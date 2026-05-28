import { auditLog } from "@/src/features/audit-logs/auditLog";
import type {
  AnnotationQueue,
  AnnotationQueueItem,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueBody,
  CreateAnnotationQueueItemBody,
  DeleteAnnotationQueueAssignmentBody,
  DeleteAnnotationQueueItemQuery,
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueItemByIdQuery,
  GetAnnotationQueueItemsQuery,
  GetAnnotationQueuesQuery,
  UpdateAnnotationQueueItemBody,
} from "@/src/features/public-api/types/annotation-queues";
import {
  AnnotationQueueStatus,
  InvalidRequestError,
  LangfuseNotFoundError,
  MethodNotAllowedError,
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import type { z } from "zod";

type GetAnnotationQueuesInput = z.infer<typeof GetAnnotationQueuesQuery>;
type GetAnnotationQueueByIdInput = z.infer<typeof GetAnnotationQueueByIdQuery>;
type GetAnnotationQueueItemsInput = z.infer<
  typeof GetAnnotationQueueItemsQuery
>;
type GetAnnotationQueueItemByIdInput = z.infer<
  typeof GetAnnotationQueueItemByIdQuery
>;
type CreateAnnotationQueueInput = z.infer<typeof CreateAnnotationQueueBody>;
type CreateAnnotationQueueItemInput = z.infer<
  typeof CreateAnnotationQueueItemBody
>;
type UpdateAnnotationQueueItemInput = z.infer<
  typeof UpdateAnnotationQueueItemBody
>;
type DeleteAnnotationQueueItemInput = z.infer<
  typeof DeleteAnnotationQueueItemQuery
>;
type CreateAnnotationQueueAssignmentInput = z.infer<
  typeof CreateAnnotationQueueAssignmentBody
>;
type DeleteAnnotationQueueAssignmentInput = z.infer<
  typeof DeleteAnnotationQueueAssignmentBody
>;

type AnnotationQueueScope = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
  plan?: string;
};

type OptionalAuditScope = {
  auditScope?: AnnotationQueueScope;
};

const toAnnotationQueueApi = (queue: {
  id: string;
  name: string;
  description: string | null;
  scoreConfigIds: string[];
  createdAt: Date;
  updatedAt: Date;
}): AnnotationQueue => ({
  id: queue.id,
  name: queue.name,
  description: queue.description,
  scoreConfigIds: queue.scoreConfigIds,
  createdAt: queue.createdAt,
  updatedAt: queue.updatedAt,
});

const toAnnotationQueueItemApi = (item: {
  id: string;
  queueId: string;
  objectId: string;
  objectType: "TRACE" | "OBSERVATION" | "SESSION";
  status: "PENDING" | "COMPLETED";
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AnnotationQueueItem => ({
  id: item.id,
  queueId: item.queueId,
  objectId: item.objectId,
  objectType: item.objectType,
  status: item.status,
  completedAt: item.completedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const verifyScoreConfigsExist = async ({
  projectId,
  scoreConfigIds,
}: {
  projectId: string;
  scoreConfigIds: string[];
}) => {
  const scoreConfigs = await prisma.scoreConfig.findMany({
    where: {
      id: { in: scoreConfigIds },
      projectId,
    },
    select: {
      id: true,
    },
  });

  const scoreConfigIdSet = new Set(scoreConfigs.map((config) => config.id));
  if (scoreConfigIds.some((id) => !scoreConfigIdSet.has(id))) {
    throw new InvalidRequestError(
      "At least one of the score config IDs cannot be found for the given project.",
    );
  }
};

export const getAnnotationQueueRecordOrThrow = async ({
  projectId,
  queueId,
}: {
  projectId: string;
} & GetAnnotationQueueByIdInput) => {
  const queue = await prisma.annotationQueue.findUnique({
    where: {
      id: queueId,
      projectId,
    },
  });

  if (!queue) {
    throw new LangfuseNotFoundError("Annotation queue not found");
  }

  return queue;
};

export const listAnnotationQueuesForApi = async ({
  projectId,
  page,
  limit,
}: {
  projectId: string;
} & GetAnnotationQueuesInput) => {
  const [queues, totalItems] = await Promise.all([
    prisma.annotationQueue.findMany({
      where: {
        projectId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.annotationQueue.count({
      where: {
        projectId,
      },
    }),
  ]);

  return {
    data: queues.map(toAnnotationQueueApi),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getAnnotationQueueForApi = async ({
  projectId,
  queueId,
}: {
  projectId: string;
} & GetAnnotationQueueByIdInput) => {
  const queue = await getAnnotationQueueRecordOrThrow({ projectId, queueId });
  return toAnnotationQueueApi(queue);
};

export const createAnnotationQueueForApi = async ({
  projectId,
  plan,
  input,
  auditScope,
}: {
  projectId: string;
  plan?: string;
  input: CreateAnnotationQueueInput;
} & OptionalAuditScope) => {
  if (plan === "cloud:hobby") {
    const queueCount = await prisma.annotationQueue.count({
      where: { projectId },
    });

    if (queueCount >= 1) {
      throw new MethodNotAllowedError(
        "Maximum number of annotation queues reached on Hobby plan.",
      );
    }
  }

  const existingQueue = await prisma.annotationQueue.findFirst({
    where: {
      projectId,
      name: input.name,
    },
  });

  if (existingQueue) {
    throw new InvalidRequestError("A queue with this name already exists.");
  }

  await verifyScoreConfigsExist({
    projectId,
    scoreConfigIds: input.scoreConfigIds,
  });

  const queue = await prisma.annotationQueue.create({
    data: {
      projectId,
      name: input.name,
      description: input.description,
      scoreConfigIds: input.scoreConfigIds,
    },
  });

  if (auditScope) {
    await auditLog({
      action: "create",
      resourceType: "annotationQueue",
      resourceId: queue.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      after: queue,
    });
  }

  return toAnnotationQueueApi(queue);
};

export const listAnnotationQueueItemsForApi = async ({
  projectId,
  queueId,
  page,
  limit,
  status,
}: {
  projectId: string;
} & GetAnnotationQueueItemsInput) => {
  // Verify the queue exists
  await getAnnotationQueueRecordOrThrow({ projectId, queueId });

  // Build the where clause based on the query parameters
  const where: {
    projectId: string;
    queueId: string;
    status?: GetAnnotationQueueItemsInput["status"];
  } = {
    projectId,
    queueId,
  };

  if (status) {
    where.status = status;
  }

  const [items, totalItems] = await Promise.all([
    prisma.annotationQueueItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.annotationQueueItem.count({
      where,
    }),
  ]);

  return {
    data: items.map(toAnnotationQueueItemApi),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getAnnotationQueueItemRecordOrThrow = async ({
  projectId,
  queueId,
  itemId,
}: {
  projectId: string;
} & GetAnnotationQueueItemByIdInput) => {
  // Verify the queue exists
  await getAnnotationQueueRecordOrThrow({ projectId, queueId });

  const item = await prisma.annotationQueueItem.findUnique({
    where: {
      id: itemId,
      queueId,
      projectId,
    },
  });

  if (!item) {
    throw new LangfuseNotFoundError("Annotation queue item not found");
  }

  return item;
};

export const getAnnotationQueueItemForApi = async ({
  projectId,
  queueId,
  itemId,
}: {
  projectId: string;
} & GetAnnotationQueueItemByIdInput) => {
  const item = await getAnnotationQueueItemRecordOrThrow({
    projectId,
    queueId,
    itemId,
  });

  return toAnnotationQueueItemApi(item);
};

export const createAnnotationQueueItemForApi = async ({
  projectId,
  queueId,
  input,
  auditScope,
}: {
  projectId: string;
  queueId: string;
  input: CreateAnnotationQueueItemInput;
} & OptionalAuditScope) => {
  // Check if the queue exists
  await getAnnotationQueueRecordOrThrow({ projectId, queueId });

  // Create the queue item with status defaulting to PENDING if not provided
  const status = input.status || AnnotationQueueStatus.PENDING;

  // Set completedAt if status is COMPLETED
  const completedAt =
    status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

  const item = await prisma.annotationQueueItem.create({
    data: {
      queueId,
      objectId: input.objectId,
      objectType: input.objectType,
      status,
      completedAt,
      projectId,
    },
  });

  if (auditScope) {
    await auditLog({
      action: "create",
      resourceType: "annotationQueueItem",
      resourceId: item.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      after: item,
    });
  }

  return toAnnotationQueueItemApi(item);
};

export const updateAnnotationQueueItemForApi = async ({
  projectId,
  queueId,
  itemId,
  input,
  auditScope,
}: {
  projectId: string;
  queueId: string;
  itemId: string;
  input: UpdateAnnotationQueueItemInput;
} & OptionalAuditScope) => {
  // Verify the queue and item exist
  const existingItem = await getAnnotationQueueItemRecordOrThrow({
    projectId,
    queueId,
    itemId,
  });

  const item = await prisma.annotationQueueItem.update({
    where: {
      id: itemId,
      queueId,
      projectId,
    },
    data: {
      status: input.status,
      completedAt:
        input.status === AnnotationQueueStatus.COMPLETED
          ? new Date()
          : undefined,
    },
  });

  if (auditScope) {
    await auditLog({
      action: "update",
      resourceType: "annotationQueueItem",
      resourceId: item.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      before: existingItem,
      after: item,
    });
  }

  return toAnnotationQueueItemApi(item);
};

export const deleteAnnotationQueueItemForApi = async ({
  projectId,
  queueId,
  itemId,
  auditScope,
}: {
  projectId: string;
} & DeleteAnnotationQueueItemInput &
  OptionalAuditScope) => {
  // Verify the queue and item exist
  const existingItem = await getAnnotationQueueItemRecordOrThrow({
    projectId,
    queueId,
    itemId,
  });

  await prisma.annotationQueueItem.delete({
    where: {
      id: itemId,
      queueId,
      projectId,
    },
  });

  if (auditScope) {
    await auditLog({
      action: "delete",
      resourceType: "annotationQueueItem",
      resourceId: existingItem.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      before: existingItem,
    });
  }

  return {
    success: true,
    message: "Annotation queue item deleted successfully",
  };
};

const verifyAssignmentUserAccess = async ({
  projectId,
  orgId,
  userId,
}: {
  projectId: string;
  orgId: string;
  userId: string;
}) => {
  const user = await getUserProjectRoles({
    projectId,
    orgId,
    filterCondition: [
      {
        column: "userId",
        operator: "any of",
        value: [userId],
        type: "stringOptions",
      },
    ],
    searchFilter: Prisma.empty,
    limit: 1,
    page: 0,
    orderBy: Prisma.empty,
  });

  if (!user || user.length === 0) {
    throw new LangfuseNotFoundError(
      "User not found or not authorized for this project",
    );
  }
};

export const createAnnotationQueueAssignmentForApi = async ({
  projectId,
  orgId,
  queueId,
  input,
  auditScope,
}: {
  projectId: string;
  orgId: string;
  queueId: string;
  input: CreateAnnotationQueueAssignmentInput;
} & OptionalAuditScope) => {
  // Verify the annotation queue exists and belongs to the project
  await getAnnotationQueueRecordOrThrow({ projectId, queueId });

  // Verify the user exists and has access to the project
  await verifyAssignmentUserAccess({ projectId, orgId, userId: input.userId });

  const assignmentWhere = {
    projectId,
    queueId,
    userId: input.userId,
  };

  // Create the assignment (upsert to handle duplicates gracefully)
  const assignment = await prisma.annotationQueueAssignment.upsert({
    where: {
      projectId_queueId_userId: assignmentWhere,
    },
    create: assignmentWhere,
    update: {},
  });

  // TODO: only create audit log if upsert actually creates a new record
  if (auditScope) {
    await auditLog({
      action: "create",
      resourceType: "annotationQueueAssignment",
      resourceId: assignment.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      after: assignment,
    });
  }

  return {
    assignment: {
      userId: input.userId,
      projectId,
      queueId,
    },
  };
};

export const deleteAnnotationQueueAssignmentForApi = async ({
  projectId,
  queueId,
  input,
  auditScope,
}: {
  projectId: string;
  queueId: string;
  input: DeleteAnnotationQueueAssignmentInput;
} & OptionalAuditScope) => {
  // Verify the annotation queue exists and belongs to the project
  await getAnnotationQueueRecordOrThrow({ projectId, queueId });

  let assignment;
  try {
    // Delete the assignment if it exists
    assignment = await prisma.annotationQueueAssignment.delete({
      where: {
        projectId_queueId_userId: {
          projectId,
          queueId,
          userId: input.userId,
        },
      },
    });
  } catch (error) {
    // If the record doesn't exist, that's fine - we still return success.
    // Only catch NotFound errors, re-throw other errors.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code !== "P2025"
    ) {
      throw error;
    }

    return {
      deleted: false,
      response: {
        success: true,
      },
    };
  }

  if (auditScope) {
    await auditLog({
      action: "delete",
      resourceType: "annotationQueueAssignment",
      resourceId: assignment.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      before: assignment,
    });
  }

  return {
    deleted: true,
    response: {
      success: true,
    },
  };
};
